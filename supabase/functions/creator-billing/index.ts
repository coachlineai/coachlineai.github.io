import {createClient} from 'npm:@supabase/supabase-js@2.49.8';

const site='https://coachlineai.github.io';
const headers={'Access-Control-Allow-Origin':site,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>Response.json(body,{headers,status});
async function read(query:any){const {data,error}=await query;if(error)throw error;return data;}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return json({error:'POST required'},405);
  const url=Deno.env.get('SUPABASE_URL')!;
  try{
    const body=await req.json(), action=body.action;
    if(action==='status'){
      const userDb=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
      if(!(await userDb.auth.getUser()).data.user)return json({error:'Please sign in.'},401);
      const rows=await read(userDb.rpc('creator_sandbox_payments'));
      const payments=rows.map((r:any)=>({date:r.day,client:{name:r.first_name||'Client'},type:'Pilot '+({week:'weekly',year:'annual',once:'lifetime'}[r.plan as string]||'plan'),status:'Paid',paid:r.cents,refunded:0,earnings:r.cents-Math.round(r.cents*.2)}));
      return json({state:'sandbox',live:false,clients:rows.length,total:payments.reduce((n:number,p:any)=>n+p.earnings,0),entries:payments.map((p:any)=>({date:p.date,net:p.earnings})),payments,payouts:[]});
    }
    if(!['intake-prices','intake-simulate','intake-checkout'].includes(action))return json({error:'Pilot checkout is available through a personal onboarding link.'},409);
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.ticket||''))return json({error:'Open your personal setup link.'},400);
    const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const c=await read(admin.from('coach_client_intake').select('client_key,creator_id,phone,coaching_paused,birth_date').eq('invite',body.ticket).not('completed_at','is',null).gte('issued_at',new Date(Date.now()-48*3600000).toISOString()).maybeSingle());
    if(!c||!c.birth_date||c.coaching_paused)return json({error:'Text your coach for a fresh personal setup link.'},403);
    const args={owner_id:c.creator_id,sender:c.phone};
    const [ready,active,line,configured]=await Promise.all([
      read(admin.rpc('pilot_client_ready',args)),read(admin.rpc('coach_has_paid_access',args)),read(admin.rpc('pilot_contact_line',args)),
      read(admin.from('coach_pricing').select('weekly_cents,annual_cents').eq('creator_id',c.creator_id).maybeSingle())
    ]);
    if(active)return action==='intake-prices'?json({active:true,coachPhone:line}):json({line,active:true});
    const quote=action==='intake-prices';
    if(!quote && (!ready||body.consent!==true))return json({error:ready?'Agree to personalized coaching to continue.':'Send the verification text from your coach’s page, then try again.'},409);
    const key=Deno.env.get('STRIPE_TEST_SECRET_KEY')||'';
    const hosted=/^(sk|rk)_test_/.test(key) && Boolean(Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET')?.startsWith('whsec_'));
    const reference=configured?.annual_cents??38388;
    const plan=body.plan as 'once'|'year'|'week';
    const prices={reference,once:await read(admin.rpc('pilot_lifetime_quote',{client:c.client_key,reserve:!quote&&plan==='once'&&body.expectedCents===9999})),week:configured?.weekly_cents??799,year:Math.round(reference/12)};
    if(quote)return json({prices,available:ready,simulation:!hosted&&ready,sandbox:true,coachPhone:line,verificationPending:!ready});
    if(!['once','year','week'].includes(plan)||prices[plan]!==body.expectedCents)return json({changed:true,error:'Review the current price and try again.'},409);
    if(action==='intake-simulate'){
      if(hosted)return json({changed:true,error:'Test checkout is available. Return to your plans.'},409);
      await read(admin.rpc('confirm_test_checkout',{client:c.client_key,session_ref:'sim_'+c.client_key,selected:plan,cents:prices[plan]}));
      return json({line});
    }
    if(!hosted)return json({error:'Open the pilot payment simulation.'},409);
    const fields:Record<string,string>={mode:plan==='once'?'payment':'subscription','line_items[0][quantity]':'1',
      'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':String(prices[plan]),
      'line_items[0][price_data][product_data][name]':'Coachline '+({once:'lifetime',year:'annual',week:'weekly'}[plan])+' coaching',
      'metadata[coachline_pilot]':'v1','metadata[client_id]':c.client_key,'metadata[creator_id]':c.creator_id,'metadata[plan]':plan,'metadata[cents]':String(prices[plan]),'metadata[opt_in]':'yes',
      success_url:site+'/payment.html#session={CHECKOUT_SESSION_ID}',cancel_url:site+'/plans.html'};
    if(plan!=='once')fields['line_items[0][price_data][recurring][interval]']=plan;
    const res=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+key,'Idempotency-Key':['pilot',c.client_key,plan,prices[plan],Math.floor(Date.now()/3600000)].join('-')},body:new URLSearchParams(fields)});
    if(!res.ok)return json({error:'The Stripe sandbox could not open checkout. Please retry.'},502);
    const session=await res.json();
    if(session.livemode!==false||!session.id?.startsWith('cs_test_'))throw Error('Unexpected checkout mode');
    return json({url:session.url});
  }catch{return json({error:'Couldn’t load pilot billing. Please try again.'},503);}
});
