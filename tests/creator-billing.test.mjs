import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/creator-billing/index.ts',import.meta.url),'utf8').replace(/^import .*;$/m,'');
function fixture({demo=false, account=null, ready=false, intake=null, pricing=null}={}) {
  const calls=[];
  let handler;
  const db={
    auth:{admin:{getUserById:async()=>({data:{user:{id:'creator'}}})},getUser:async()=>({data:{user:{id:'creator'}}})},
    from(table) {
      return {
        select(){return this}, eq(){return this},not(){return this},gte(){return this},
        async maybeSingle(){
          const rows={coach_client_intake:intake,coach_pricing:pricing,profiles:{id:'creator'},creator_payout_exclusions:demo?{}:null,creator_stripe_accounts:account?{account_id:account}:null};
          return {data:rows[table]};
        },
        async upsert(row){account=row.account_id;return {}}
      };
    }
  };
  async function fetch(url,req){
    const path=new URL(url).pathname.slice(4);
    calls.push({path,params:Object.fromEntries(req.body||[])});
    const data = path==='accounts'?{id:'acct_A'}:path==='accounts/acct_A'?{charges_enabled:ready,payouts_enabled:ready,capabilities:{transfers:'active'},settings:{payouts:{schedule:{interval:'monthly',monthly_anchor:15}}}}:{url:'https://checkout.stripe.com/c/pay/mock'};
    return Response.json(data);
  }
  vm.runInNewContext(stripTypeScriptTypes(source),{URLSearchParams,Response,console,crypto,TextEncoder,fetch,createClient:()=>db,Deno:{env:{get:()=> 'sk_live_mock'},serve:fn=>handler=fn}});
  return {calls,request:(action,body={})=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({action,...body})}))};
}
test('test creator cannot onboard or charge and Stripe receives no calls',async()=>{
  const f=fixture({demo:true});
  for(const action of ['checkout','connect'])assert.equal((await f.request(action)).status,409);
  assert.equal(f.calls.length,0);
});
test('checkout requires a mapped account ready for payouts',async()=>{
  for(const account of [null,'acct_A'])assert.equal((await fixture({account}).request('checkout')).status,409);
});
test('onboarding sets monthly payouts on day 15 and reuses the mapping',async()=>{
  const f=fixture();
  await f.request('connect'); await f.request('connect');
  const created=f.calls.filter(c=>c.path==='accounts');
  assert.equal(created.length,1);
  assert.equal(created[0].params['settings[payouts][schedule][monthly_anchor]'],'15');
  assert.equal(created[0].params['settings[payouts][schedule][interval]'],'monthly');
});
test('all three plans route the creator share to their Stripe account',async()=>{
  const f=fixture({account:'acct_A',ready:true});
  assert.equal((await f.request('checkout')).status,200);
  const sessions=f.calls.filter(c=>c.path==='checkout/sessions');
  assert.equal(sessions.length,3);
  for(const {params} of sessions){
    const once=params.mode==='payment';
    const prefix=once?'payment_intent_data':'subscription_data';
    assert.equal(params[prefix+'[transfer_data][destination]'],'acct_A');
    assert.equal(params[prefix+'[transfer_data]['+(once?'amount':'amount_percent')+']'],once?'18400':'80');
  }
});

const ticket='00000000-0000-4000-8000-000000000000';
test('expired or unfinished intakes cannot open checkout',async()=>{
  const f=fixture();
  assert.equal((await f.request('intake-prices',{ticket})).status,403);
  assert.equal(f.calls.length,0);
});
test('intake quotes the creator prices and validates the amount before opening Stripe',async()=>{
  const f=fixture({intake:{creator_id:'creator'},account:'acct_A',ready:true,pricing:{weekly_cents:999,annual_cents:48000}});
  const quote=await (await f.request('intake-prices',{ticket})).json();
  assert.deepEqual(quote,{prices:{week:999,year:4000,once:23000,reference:48000},available:true});
  assert.equal((await f.request('intake-checkout',{ticket,plan:'year',expectedCents:3196})).status,409);
  for (const [plan,expectedCents] of [['year',4000],['once',23000],['week',999]]) {
    assert.equal((await f.request('intake-checkout',{ticket,plan,expectedCents})).status,200);
    const params=f.calls.at(-1).params;
    assert.equal(params['line_items[0][price_data][unit_amount]'],String(expectedCents));
    assert.equal(params['line_items[0][price_data][recurring][interval]'],plan==='once'?undefined:plan);
    assert.equal(params['metadata[creator_id]'],'creator');
    assert.ok(!JSON.stringify(params).includes(ticket));
  }
});
test('unconnected creators can show prices without allowing payment',async()=>{
  const f=fixture({intake:{creator_id:'creator'}});
  const q=await (await f.request('intake-prices',{ticket})).json();
  assert.deepEqual(q,{available:false,prices:{week:799,year:3196,once:23000,reference:38352}});
  assert.equal((await f.request('intake-checkout',{ticket,plan:'week',expectedCents:799})).status,409);
});
