import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/checkout-status/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const sessionId='cs_live_12345678901234567890';
function setup({plan='once',paid=true,refunded=false,subscription=null,testKey,amount=9999,orderAmount=amount}={}){
  let handler;
  const row={creator_id:'creator',session_id:sessionId,plan,state:'pending',amount_cents:orderAmount};
  const session={livemode:true,currency:'usd',amount_total:amount,metadata:{coachline_plan:plan,creator_id:'creator'},payment_status:paid?'paid':'unpaid',
    subscription,payment_intent:{latest_charge:{paid,refunded}},customer_details:{phone:'+12025550123'}};
  const db={from(table){return {
    select(){return this},eq(){return this},or(){return {error:null}},update(change){Object.assign(row,change);return this},
    async single(){return {data:row}},async maybeSingle(){return {data:table==='coaching_orders'?row:{phone_line:'+12025550124'}}}
  }}};
  class Stripe{
    static createFetchHttpClient(){} static createSubtleCryptoProvider(){}
    checkout={sessions:{retrieve:async()=>session,create:async()=>({url:'https://checkout.stripe.com/c/pay/test'})}};
    webhooks={constructEventAsync:async(raw,signature)=>{if(signature!=='verified')throw Error();return {data:{object:{object:'checkout.session',id:sessionId}},livemode:true}}};
  }
  const env={STRIPE_SECRET_KEY:'sk_live_mock',STRIPE_WEBHOOK_SECRET:'whsec_mock',STRIPE_TEST_SECRET_KEY:testKey};
  vm.runInNewContext(stripTypeScriptTypes(source),{Response,URL,Stripe,console,createClient:()=>db,Deno:{serve:fn=>handler=fn,env:{get:name=>env[name]}}});
  return {row,post:(body,headers={})=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify(body),headers}))};
}
test('sandbox uses only a test key and never creates a live purchase',async()=>{
  for(const key of [undefined,'sk_live_example','sk_test_example']){
    const f=setup({testKey:key});
    const response=await f.post({action:'preview',plan:'once',attempt:crypto.randomUUID()});
    const result=await response.json();
    if(key==='sk_test_example') assert.match(result.url,/checkout.stripe.com/); else assert.equal(result.demo,true);
    assert.equal(f.row.state,'pending');
  }
});
test('paid receipt and retried webhook reconcile the same order',async()=>{
  const f=setup();
  assert.equal((await f.post({}, {'stripe-signature':'invalid'})).status,400);
  assert.equal(f.row.state,'pending');
  for(let i=0;i<2;i++)assert.equal((await f.post({},{'stripe-signature':'verified'})).status,200);
  const result=await (await f.post({session:sessionId})).json();
  assert.equal(result.state,'active');assert.equal(result.coachPhone,'+12025550124');
  assert.equal(f.row.client_phone,'+12025550123');
});
test('unpaid, fully refunded, mismatched and incomplete sessions do not grant access',async()=>{
  for(const [args,state] of [[{paid:false},'pending'],[{refunded:true},'ended'],[{amount:500,orderAmount:9999},'pending']]){
    const f=setup(args);await f.post({session:sessionId});assert.equal(f.row.state,state);
  }
  const f=setup();assert.equal((await f.post({session:'invalid'})).status,400);
});
test('subscriptions record the paid term and respect cancellation',async()=>{
  for(const status of ['active','canceled']){
    const f=setup({plan:'week',subscription:{id:'sub_a',status,current_period_end:Math.ceil(Date.now()/1000)+86400,latest_invoice:{status:'paid',amount_paid:799}}});
    const result=await (await f.post({session:sessionId})).json();
    assert.equal(result.state,status==='active'?'active':'ended');assert.ok(f.row.paid_through);
  }
});
