import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/creator-billing/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const ticket='11111111-1111-4111-8111-111111111111';
function fixture({ready=true,key='',record=true}={}){
 let serve;const recorded=[],calls=[];
 const db={
   from(table){return {select(){return this},eq(){return this},not(){return this},gte(){return this},maybeSingle(){return {data:table==='coach_pricing'?null:record?{client_key:'client',creator_id:'creator',phone:'test',birth_date:'1994-01-01'}:null}}}},
   rpc(name,args){if(name==='confirm_test_checkout')recorded.push(args);return {data:({pilot_client_ready:ready,coach_has_paid_access:false,pilot_contact_line:'test-line',pilot_lifetime_quote:9999})[name]}}
 };
 const fetch=async(url,opts)=>{calls.push({url,opts});return Response.json({id:'cs_test_example',livemode:false,url:'https://checkout.stripe.com/c/pay/example'})};
 vm.runInNewContext(stripTypeScriptTypes(source),{createClient:()=>db,fetch,URLSearchParams,Response,Deno:{env:{get:n=>n==='STRIPE_TEST_SECRET_KEY'?key:n==='STRIPE_TEST_WEBHOOK_SECRET'?'whsec_fixture':'sk_live_ignored'},serve:fn=>serve=fn}});
 return {recorded,calls,request:(action,extra={})=>serve(new Request('https://example.test',{method:'POST',body:JSON.stringify({ticket,action,plan:'year',expectedCents:3199,consent:true,...extra})}))};
}
test('only a completed, verified and consenting client can activate a sandbox plan',async()=>{
 for(const [settings,extra,status] of [[{record:false},{},403],[{ready:false},{},409],[{},{consent:false},409],[{},{expectedCents:1},409]]){
  const f=fixture(settings);assert.equal((await f.request('intake-simulate',extra)).status,status);assert.equal(f.recorded.length,0);
 }
 const f=fixture();assert.equal((await f.request('intake-simulate')).status,200);assert.equal(f.recorded[0].selected,'year');assert.equal(f.recorded[0].client,'client');assert.equal(f.calls.length,0);
});
test('hosted checkout uses a test key and the intake owner, equally for all three plans',async()=>{
 for(const [plan,expectedCents] of [['once',9999],['year',3199],['week',799]]){
  const f=fixture({key:'sk_test_fixture'});assert.equal((await f.request('intake-checkout',{plan,expectedCents,creator_id:'spoofed'})).status,200);
  const {opts}=f.calls[0];assert.equal(opts.headers.Authorization,'Bearer sk_test_fixture');assert.equal(opts.body.get('metadata[creator_id]'),'creator');assert.equal(opts.body.get('mode'),plan==='once'?'payment':'subscription');assert.equal(f.recorded.length,0);
 }
});
test('live keys and legacy direct payment links cannot open checkout during the pilot',async()=>{
 const f=fixture({key:'sk_live_disabled'});
 for(const a of ['offer-checkout','connect','intake-checkout'])assert.equal((await f.request(a)).status,409);
 assert.equal(f.calls.length,0);
});
