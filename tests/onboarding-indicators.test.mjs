import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/coach-inbound/index.ts',import.meta.url),'utf8');
const script=stripTypeScriptTypes(source.replace(/^import .*;$/gm,''));
const sender='+12025550101', line='+12025550102';

async function greeting({service='iMessage',stage='onboarding',failIndicators=false,failSend=false}={}) {
  const calls=[];
  let handle;
  const db={
    from(table){
      const q={select(){return q},eq(){return q},update(){return q},
        maybeSingle(){return {data:{creator_id:'gateway',phone_line:line}}},
        single(){return {data:table==='coach_client_intake'?{coaching_paused:false}:{published_style:{}}}}
      };
      return q;
    },
    rpc(name){
      return {data:{client_message_owner:'creator',pilot_client_ready:false,coach_has_paid_access:false,
        attributed_client_message_gate:{stage,first:true,invite:'example'}}[name]};
    }
  };
  const ctx=vm.createContext({createClient:()=>db,Response,AbortSignal,console:{warn(){}},
    Deno:{env:{get:()=>undefined},serve:fn=>handle=fn},fetch:async(url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(body.number,sender);
      assert.equal(body.from_number,line);
      const path=new URL(url).pathname.split('/').at(-1);
      calls.push(body.state||path);
      if(path==='send-message'){
        assert.match(body.content,/onboarding\/#example/);
        return Response.json(failSend?{}:{message_handle:'sent'});
      }
      if(failIndicators)throw Error('provider timeout');
      return Response.json({status:'OK'});
    }});
  vm.runInContext(script,ctx);
  const response=await handle(new Request('https://example.invalid',{method:'POST',
    headers:{'sb-signing-secret':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'},
    body:JSON.stringify({from_number:sender,to_number:line,is_outbound:false,service,content:'What’s up, Kenny?',message_handle:'first'})}));
  return {status:response.status,calls};
}

test('the first creator greeting requests a read receipt and typing before sending the link',async()=>{
  assert.deepEqual(await greeting(),{status:204,calls:['mark-read','start','send-message','stop']});
});
test('an indicator outage still delivers the onboarding link',async()=>{
  assert.deepEqual(await greeting({failIndicators:true}),{status:204,calls:['mark-read','start','send-message','stop']});
});
test('a failed reply stops typing and remains retryable',async()=>{
  assert.deepEqual(await greeting({failSend:true}),{status:503,calls:['mark-read','start','send-message','stop']});
});
test('SMS sends only the link and a duplicate onboarding event stays silent',async()=>{
  assert.deepEqual(await greeting({service:'SMS'}),{status:204,calls:['send-message']});
  assert.deepEqual(await greeting({stage:'duplicate'}),{status:204,calls:[]});
});
