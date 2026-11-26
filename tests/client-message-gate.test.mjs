import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/coach-inbound/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const sender='+12025550101', line='+12025550102';
async function receive(gate,{content='Build me a workout',media='',retry=false}={}){
  const calls=[], messages=[],updates=[];
  let handler;
  const db={
    from(table){return {
      select(){return this},eq(){return this},single(){return {data:{}}},order(){return this},limit(){return {data:[]}},
      update(row){updates.push([table,row]);return this},
      maybeSingle(){return {data:{creator_id:'creator',phone_line:line,published_style:{}}}}
    }},
    rpc(name,args){
      calls.push(name);assert.equal(args.sender,sender);
      return {data:name==='client_message_gate'?gate:'claimed'};
    }
  };
  async function fetch(url,opts){
    calls.push(url);
    if(url.endsWith('send-message')){
      messages.push(JSON.parse(opts.body));return Response.json(retry?{}:{message_handle:'sent'});
    }
    if(url.includes('generateContent'))return Response.json({candidates:[{content:{parts:[{text:'Here is your workout.'}]}}]});
    throw Error('Unexpected request');
  }
  vm.runInNewContext(stripTypeScriptTypes(source),{Request,Response,AbortSignal,Buffer,console,crypto,URL,fetch,createClient:()=>db,trainerInstructions:()=>'',Deno:{env:{get:key=>key==='SENDBLUE_TEST_NUMBER'?sender:'fixture'},serve:fn=>handler=fn}});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{'sb-signing-secret':'00000000-0000-4000-8000-000000000001'},body:JSON.stringify({is_outbound:false,from_number:sender,to_number:line,content,media_url:media,service:'sms',message_handle:'handle'})}));
  return {calls,messages,updates,status:response.status};
}
test('a first text receives a greeting and personal onboarding link without starting an AI turn',async()=>{
  const r=await receive({stage:'onboarding',first:true,invite:'ticket'});
  assert.equal(r.status,204);assert.match(r.messages[0].content,/Yo!.*AI coach[\s\S]+onboarding\/#ticket/);
  assert.deepEqual(r.calls,['client_message_gate','https://api.sendblue.co/api/send-message']);
});
test('an unpaid client asking for photo coaching gets the checkout link without fetching the photo',async()=>{
  const r=await receive({stage:'payment',invite:'ticket'},{media:'https://example.test/meal.jpg'});
  assert.match(r.messages[0].content,/plans.html#intake=ticket/);
  assert.deepEqual(r.calls,['client_message_gate','https://api.sendblue.co/api/send-message']);
});
test('duplicates, unknown states, and failed setup sends do not produce coaching',async()=>{
  assert.deepEqual((await receive({stage:'duplicate'})).messages,[]);
  assert.equal((await receive({ready:true})).status,503);
  const failed=await receive({stage:'onboarding',invite:'ticket'},{retry:true});
  assert.equal(failed.status,503);assert.ok(failed.updates[0][1].claimed_at);
});
test('verified coaching access requires a second claim before generating the reply',async()=>{
  const r=await receive({stage:'coach',ready:true,age:23});
  assert.equal(r.status,204);assert.equal(r.calls[1],'claim_client_phone_turn');
  assert.match(r.calls[2],/generateContent/);assert.equal(r.messages[0].content,'Here is your workout.');
});
