import {requestBeforePhoto} from './before-photo.ts';
import Stripe from 'npm:stripe@16.12.0';
import {createClient} from 'npm:@supabase/supabase-js@2.49.8';

const site = 'https://coachlineai.github.io';
const headers = {'Access-Control-Allow-Origin':site,'Access-Control-Allow-Headers':'content-type, apikey','Cache-Control':'no-store'};
const reply = (data:unknown,status=200) => Response.json(data,{status,headers});
const offers = {
  once:{name:'Coachline lifetime training',amount:9999},
  year:{name:'Coachline annual coaching',amount:3199},
  week:{name:'Coachline weekly coaching',amount:799}
};
type Plan = keyof typeof offers;
const stripeClient = (key:string) => new Stripe(key,{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
const db = () => createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function sandbox(plan:Plan,attempt:string) {
  const key=Deno.env.get('STRIPE_TEST_SECRET_KEY') || '';
  if (!/^(sk|rk)_test_/.test(key)) return reply({demo:true});
  const offer=offers[plan];
  const session=await stripeClient(key).checkout.sessions.create({
    mode:plan==='once'?'payment':'subscription',
    line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:offer.amount,
      product_data:{name:offer.name},...(plan==='once'?{}:{recurring:{interval:plan}})}}],
    metadata:{coachline_preview:'yes',plan},
    cancel_url:site+'/plans.html#preview&plan='+plan,
    success_url:site+'/payment.html#session={CHECKOUT_SESSION_ID}'
  },{idempotencyKey:'preview-'+plan+'-'+attempt});
  return reply({url:session.url});
}

async function reconcile(id:string,stripe:Stripe,retryPhoto=false) {
  const database=db();
  const {data:order,error}=await database.from('coaching_orders').select('*').eq('session_id',id).maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const checked=new Date().toISOString();
  const session=await stripe.checkout.sessions.retrieve(id,{expand:['payment_intent.latest_charge','subscription.latest_invoice']});
  if (!session.livemode || session.metadata?.creator_id!==order.creator_id ||
      session.metadata?.coachline_plan!==order.plan || session.currency!=='usd' ||
      session.amount_total!==order.amount_cents) throw Error('Order mismatch');
  const subscription=session.subscription as Stripe.Subscription|null;
  const invoice=subscription?.latest_invoice as Stripe.Invoice|null;
  const intent=session.payment_intent as Stripe.PaymentIntent|null;
  const charge=intent?.latest_charge as Stripe.Charge|null;
  let state='pending';
  let through=order.paid_through;
  if (subscription) {
    if (invoice?.status==='paid' && invoice.amount_paid>0)
      through=new Date(subscription.current_period_end*1000).toISOString();
    if (['canceled','unpaid','incomplete_expired','paused'].includes(subscription.status)) state='ended';
    else if (through && new Date(through).getTime()>Date.now()) state='active';
  } else if (order.plan==='once' && session.payment_status==='paid' && charge?.paid) {
    state=charge.refunded?'ended':'active';
  }
  if (session.status==='expired') state='ended';
  const update=await database.from('coaching_orders').update({
    state,paid_through:through,checked_at:checked,payment_intent_id:intent?.id||null,subscription_id:subscription?.id||null,
    client_phone:order.client_phone || session.customer_details?.phone || null
  }).eq('session_id',id).or('checked_at.is.null,checked_at.lte.'+checked);
  if(update.error) throw update.error;
  const {data:current,error:readError}=await database.from('coaching_orders').select('state,plan,amount_cents').eq('session_id',id).single();
  if(readError) throw readError;
  const {data:creator,error:creatorError}=await database.from('coach_preview_sessions').select('phone_line').eq('creator_id',order.creator_id).maybeSingle();
  if(creatorError) throw creatorError;
  if(current.state==='active' && creator?.phone_line){
    try {await requestBeforePhoto(database,order.creator_id,order.client_phone || session.customer_details?.phone,creator.phone_line);}
    catch(err){if(retryPhoto)throw err;console.warn('Starting photo invitation pending');}
  }
  return {state:current.state,plan:current.plan,amount:current.amount_cents,coachPhone:current.state==='active'?creator?.phone_line:null};
}

async function confirmPilot(s:Stripe.Checkout.Session){
  const m=s.metadata;
  if(s.livemode||m?.coachline_pilot!=='v1'||m.opt_in!=='yes'||!Object.hasOwn(offers,m.plan)||s.currency!=='usd'||s.amount_total!==Number(m.cents))return null;
  if(s.payment_status!=='paid')return {sandbox:true,state:s.status==='expired'?'ended':'pending'};
  const database=db();
  const record=await database.from('coach_client_intake').select('phone,creator_id').eq('client_key',m.client_id).eq('creator_id',m.creator_id).single();
  if(record.error)throw record.error;
  const saved=await database.rpc('confirm_test_checkout',{client:m.client_id,session_ref:s.id,selected:m.plan,cents:s.amount_total});
  if(saved.error)throw saved.error;
  const line=await database.rpc('pilot_contact_line',{owner_id:m.creator_id,sender:record.data.phone});
  if(line.error)throw line.error;
  return {state:'active',sandbox:true,plan:m.plan,amount:s.amount_total,coachPhone:line.data};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response(null,{headers});
  if(req.method!=='POST') return reply({error:'POST required'},405);
  try {
    const signature=req.headers.get('stripe-signature');
    if(signature){
      const raw=await req.text();
      const testKey=Deno.env.get('STRIPE_TEST_SECRET_KEY')||'';
      const testSecret=Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET');
      if(testSecret&&/^(sk|rk)_test_/.test(testKey)){
        let event;
        const test=stripeClient(testKey);
        try{event=await test.webhooks.constructEventAsync(raw,signature,testSecret,undefined,Stripe.createSubtleCryptoProvider());}catch{/* May be a live reconciliation event. */}
        if(event&&!event.livemode){
          if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded')await confirmPilot(await test.checkout.sessions.retrieve(event.data.object.id));
          return reply({received:true});
        }
      }
      const key=Deno.env.get('STRIPE_SECRET_KEY') || '';
      const secret=Deno.env.get('STRIPE_WEBHOOK_SECRET') || (await db().rpc('coachline_webhook_key')).data;
      if(!secret || !/^(sk|rk)_live_/.test(key)) return reply({error:'Webhook setup pending'},503);
      const stripe=stripeClient(key);
      let event:Stripe.Event;
      try {event=await stripe.webhooks.constructEventAsync(raw,signature,secret,undefined,Stripe.createSubtleCryptoProvider());}
      catch {return reply({error:'Invalid signature'},400);}
      if(!event.livemode)return reply({received:true});
      const object=event.data.object;
      let sessionId;
      if(object.object==='checkout.session') sessionId=object.id;
      else {
        let subscription:string|undefined;
        let intent:string|undefined;
        if(object.object==='subscription') subscription=object.id;
        if(object.object==='invoice' && typeof object.subscription==='string') subscription=object.subscription;
        if(object.object==='charge' && typeof object.payment_intent==='string') intent=object.payment_intent;
        if(subscription || intent){
          const sessions=await stripe.checkout.sessions.list(subscription?{subscription,limit:1}:{payment_intent:intent,limit:1});
          sessionId=sessions.data[0]?.id;
        }
      }
      if(sessionId) await reconcile(sessionId,stripe,true);
      return reply({received:true});
    }
    const body=await req.json().catch(()=>({}));
    if(body.action==='preview' && Object.hasOwn(offers,body.plan) && /^[a-f0-9-]{36}$/.test(body.attempt))
      return await sandbox(body.plan,body.attempt);
    const id=body.session;
    if(typeof id!=='string'||!/^cs_(test|live)_[A-Za-z0-9]{16,200}$/.test(id))return reply({error:'Invalid checkout session'},400);
    if(id.startsWith('cs_test_')){
      const key=Deno.env.get('STRIPE_TEST_SECRET_KEY')||'';
      if(!/^(sk|rk)_test_/.test(key))return reply({error:'Sandbox unavailable'},503);
      const s=await stripeClient(key).checkout.sessions.retrieve(id);
      if(s.metadata?.coachline_pilot==='v1'){const result=await confirmPilot(s);return result?reply(result):reply({error:'Unknown checkout'},404);}
      if(s.livemode || s.metadata?.coachline_preview!=='yes')return reply({error:'Unknown checkout'},404);
      return reply({demo:true,state:s.payment_status==='paid'?'active':'pending',plan:s.metadata.plan,amount:s.amount_total});
    }
    const key=Deno.env.get('STRIPE_SECRET_KEY')||'';
    if(!/^(sk|rk)_live_/.test(key))return reply({error:'Payments unavailable'},503);
    const result=await reconcile(id,stripeClient(key));
    return result?reply(result):reply({error:'Unknown checkout'},404);
  }catch {return reply({error:'Could not verify the checkout. Please try again.'},503);}
});
