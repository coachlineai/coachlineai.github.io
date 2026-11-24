import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/creator-billing/index.ts',import.meta.url),'utf8').replace(/^import .*;$/m,'');
function fixture({demo=false, account=null, ready=false}={}) {
  const calls=[];
  let handler;
  const db={
    auth:{getUser:async()=>({data:{user:{id:'creator'}}})},
    from(table) {
      return {
        select(){return this}, eq(){return this},
        async maybeSingle(){
          const rows={profiles:{id:'creator'},creator_payout_exclusions:demo?{}:null,creator_stripe_accounts:account?{account_id:account}:null};
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
  vm.runInNewContext(stripTypeScriptTypes(source),{URLSearchParams,Response,console,fetch,createClient:()=>db,Deno:{env:{get:()=> 'sk_live_mock'},serve:fn=>handler=fn}});
  return {calls,request:action=>handler(new Request('https://example.test',{method:'POST',body:JSON.stringify({action})}))};
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
