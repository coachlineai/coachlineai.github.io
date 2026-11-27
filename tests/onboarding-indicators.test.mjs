import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/coach-inbound/index.ts',import.meta.url),'utf8');
const script=stripTypeScriptTypes(source.replace(/^import .*;$/gm,''));
const sender='+12025550101', line='+12025550102';

async function greeting({service='iMessage',stage='onboarding',failIndicators=false,failSend=false,processingMs=0,declineTyping=false,content='What’s up, Kenny?',duplicateGreeting=false,check,starterState='done'}={}) {
  const calls=[];
  let sentBody;
  let handle;
  let clock=0;
  const db={
    from(table){
      const q={select(){return q},eq(){return q},update(){return q},
        maybeSingle(){return {data:table==='coaching_jobs'?{state:starterState,attempts:0,next_at:new Date().toISOString()}:{creator_id:'gateway',phone_line:line}}},
        single(){return {data:table==='coach_client_intake'?{coaching_paused:false,completed_at:new Date().toISOString(),coaching_processing_consent_at:'test'}:{published_style:{}}}}
      };
      return q;
    },
    rpc(name){
      return {data:{claim_setup_greeting:!duplicateGreeting,claim_client_phone_turn:'claimed',issue_client_progress_link:'example',client_message_owner:'creator',pilot_client_ready:false,coach_has_paid_access:false,
        attributed_client_message_gate:{stage,ready:true,first:true,invite:'example'}}[name]};
    }
  };
  const ctx=vm.createContext({read:async r=>(await r).data,profileFields:'*',generate:async parts=>({message:'Gemini '+JSON.parse(parts[0].text).intent}),createClient:()=>db,Response,AbortSignal,console:{warn(){},info(){}},
    performance:{now:()=>clock},setTimeout:(fn,ms)=>{calls.push('wait '+ms); clock+=ms; fn();},
    pilotTurn:async(db,owner,phone,style,handle,caption,media,send)=>{clock+=processingMs; if(content==='done')return false; await send('Your plan'); return true;},
    Deno:{env:{get:()=>undefined},serve:fn=>handle=fn},fetch:async(url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(body.number,sender);
      assert.equal(body.from_number,line);
      const path=new URL(url).pathname.split('/').at(-1);
      calls.push(body.state||path);
      if(path==='mark-read') {await Promise.resolve();calls.push('read settled');}
      if(path==='send-message'){
        sentBody=body.content;
        if(!check)assert.ok(body.content.includes('onboarding/#example') || body.content==='Your plan');
        return Response.json(failSend?{}:{message_handle:'sent'});
      }
      if(body.state==='start') assert.equal(body.max_duration_ms,undefined);
      if(body.state==='start' && declineTyping) return Response.json({status:'ERROR'},{status:400});
      if(failIndicators)throw Error('provider timeout');
      return Response.json({status:'OK'});
    }});
  vm.runInContext(script,ctx);
  const response=await handle(new Request('https://example.invalid',{method:'POST',
    headers:{'sb-signing-secret':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'},
    body:JSON.stringify({from_number:sender,to_number:line,is_outbound:false,service,content,message_handle:'first'})}));
  if(check)check(sentBody);
  return {status:response.status,calls};
}

test('the first creator greeting requests a read receipt and typing before sending the link',async()=>{
  assert.deepEqual(await greeting(),{status:204,calls:['mark-read','read settled','start','wait 3000','send-message','stop']});
});
test('an indicator outage still delivers the onboarding link',async()=>{
  assert.deepEqual(await greeting({failIndicators:true}),{status:204,calls:['mark-read','read settled','start','start','wait 3000','send-message','stop']});
});
test('a failed reply stops typing and remains retryable',async()=>{
  assert.deepEqual(await greeting({failSend:true}),{status:503,calls:['mark-read','read settled','start','wait 3000','send-message','stop']});
});
test('SMS sends only the link and a duplicate onboarding event stays silent',async()=>{
  assert.deepEqual(await greeting({service:'SMS'}),{status:204,calls:['send-message']});
  assert.deepEqual(await greeting({stage:'duplicate'}),{status:204,calls:[]});
});

test('a generated reply uses time already spent composing',async()=>{
  assert.deepEqual(await greeting({stage:'payment',processingMs:1250}),{status:204,calls:['mark-read','read settled','start','wait 1750','send-message','stop']});
  assert.deepEqual(await greeting({stage:'payment',processingMs:3500}),{status:204,calls:['mark-read','read settled','start','send-message','stop']});
});

test('a definitive provider rejection still lets the reply through',async()=>{
  assert.deepEqual(await greeting({declineTyping:true}),{status:204,calls:['mark-read','read settled','start','send-message']});
});

test('Gemini drafts the intro and the server attaches the real invitation and DONE instruction',async()=>{
  await greeting({check:body=>assert.match(body,/Gemini greeting[\s\S]+onboarding\/#example[\s\S]+Text “done”/)});
  assert.deepEqual((await greeting({duplicateGreeting:true})).calls,[]);
});
test('a completion claim follows the saved stage',async()=>{
  for(const [stage,link] of [['onboarding','onboarding/#example'],['payment','plans.html#intake=example']]){
    await greeting({content:'done',stage,check:body=>{assert.ok(body.includes('Gemini completion'));assert.ok(body.includes(link));}});
  }
  await greeting({content:'I did it',stage:'coach',check:body=>assert.match(body,/onboarding is complete/)});
  assert.ok(!(await greeting({content:'done',stage:'coach',starterState:'queued'})).calls.includes('send-message'));
});

test('slow replies get one wait notice before the answer and fast replies get none',async()=>{
  let tick,release;
  const notices=[];
  const ctx=vm.createContext({Deno:{serve(){}},setTimeout(fn,ms){assert.equal(ms,8000);tick=fn;return 1},clearTimeout(){tick=null},console});
  vm.runInContext(script,ctx);
  const finishFast=ctx.slowReplyNotice(async()=>notices.push('unexpected'));
  await finishFast();
  assert.equal(tick,null);
  const finishSlow=ctx.slowReplyNotice(()=>new Promise(resolve=>{notices.push('notice');release=resolve}));
  tick();
  const reply=finishSlow().then(()=>notices.push('answer'));
  assert.deepEqual(notices,['notice']);
  release();
  await reply;
  await finishSlow();
  assert.deepEqual(notices,['notice','answer']);
});

test('checkout also coalesces a quick second hello before typing or sending',async()=>{
  assert.deepEqual((await greeting({stage:'payment',duplicateGreeting:true})).calls,[]);
});
