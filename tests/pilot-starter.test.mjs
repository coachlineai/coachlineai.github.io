import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

const load=file=>readFileSync(new URL('../supabase/functions/coaching-worker/'+file,import.meta.url),'utf8');
test('verified sandbox client receives meals from the saved profile, workouts, a plan question and a private dashboard link',async()=>{
  const deliveries=[],requests=[],stored=[];
  const client={client_key:'client',creator_id:'creator',phone:'test-recipient',first_name:'Sam',sex:'Male',birth_date:'1994-04-03',completed_at:'2026-11-26',coaching_processing_consent_at:'2026-11-26',coaching_paused:false,food_allergies:['Peanuts'],workout_styles:['Free weights'],session_length:'30 minutes'};
  const job={id:1,job_key:'starter',kind:'starter',client_id:'client',cursor_index:0,input:{}};
  const db={from(table){
    const q={
      select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return {data:[]}},
      update(values){stored.push(values);return q},
      single(){return {data:table==='coach_client_intake'?client:table==='coach_preview_sessions'?{phone_line:null,published_style:{}}:{id:1}}}
    };return q;
  },rpc(name){return {data:({valid_coaching_worker:true,claim_coaching_job:[job],pilot_contact_line:'test-line',coach_has_paid_access:true,pilot_client_ready:true,issue_client_progress_link:'test-only',coaching_delivery_step:null})[name]}}};
  let handler;
  const ctx=vm.createContext({createClient:()=>db,Buffer,URL,Response,AbortSignal,console,
    Deno:{env:{get:()=>undefined},serve:fn=>handler=fn},
    fetch:async(_,opts)=>{deliveries.push(JSON.parse(opts.body));return Response.json({message_handle:'ok'})}});
  const script=load('cycle.ts').replaceAll('export ','')+'\n'+load('trainer.ts').replaceAll('export ','')+'\n'+load('index.ts').replace(/^import .*;$/gm,'');
  vm.runInContext(stripTypeScriptTypes(script),ctx);
  ctx.capture=async(parts)=>{requests.push(JSON.parse(parts[0].text));return {meal:'Monday: Rice and beans',workout:'Monday: Easy strength, 30 minutes',review:''}};
  vm.runInContext('generate=capture',ctx);
  const result=await handler(new Request('https://example.invalid',{method:'POST',headers:{'x-worker-token':'fixture'}}));
  assert.equal(result.status,204);assert.deepEqual(requests[0].profile.food_allergies,['Peanuts']);
  assert.equal(requests[0].profile.session_length,'30 minutes');assert.equal(requests[0].profile.phone,undefined);
  assert.deepEqual(deliveries.map(d=>d.from_number),Array(5).fill('test-line'));
  assert.match(deliveries[0].content,/What’s up, man/);assert.match(deliveries[1].content,/Rice and beans/);
  assert.match(deliveries[2].content,/Easy strength/);assert.match(deliveries[3].content,/PLAN OK/);
  assert.match(deliveries[4].content,/progress\/#access=test-only/);assert.equal(stored.at(-1).state,'done');
});
