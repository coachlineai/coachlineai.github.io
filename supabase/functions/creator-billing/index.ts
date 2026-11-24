import {createClient} from 'npm:@supabase/supabase-js@2.49.8';

const site = 'https://coachlineai.github.io';
const cors = {'Access-Control-Allow-Origin':site,'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Cache-Control':'no-store'};
const json = (body: unknown, status=200) => Response.json(body,{status,headers:cors});
const day = (seconds:number) => new Date(seconds*1000).toISOString().slice(0,10);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{headers:cors});
  if (req.method !== 'POST') return json({error:'POST required'},405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization') || ''}}});
    const {data:{user},error} = await caller.auth.getUser();
    if (error || !user) return json({error:'Sign in again.'},401);
    const {data: profile,error: authError} = await caller.from('profiles').select('id').eq('id',user.id).maybeSingle();
    if (!profile || authError) return json({error:'An active creator session is required.'},403);
    const {action} = await req.json();
    if (!['status','connect','checkout'].includes(action)) return json({error:'Unknown action'},400);
    const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const excluded = await admin.from('creator_payout_exclusions').select('creator_id').eq('creator_id',user.id).maybeSingle();
    if (excluded.error) throw excluded.error;
    function unavailable(state:string, message:string) {
      return action==='status' ? json({state,total:0,clients:0,payments:[],payouts:[]}) : json({error:message},409);
    }
    if (excluded.data || user.email?.toLowerCase()==='meetaka813@gmail.com')
      return unavailable('demo','Live payments are disabled for this demo account.');
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    const live = key?.startsWith('sk_live_') || key?.startsWith('rk_live_');
    if (!live) return unavailable('setup','Coachline live payments setup is pending.');
    const lookup = () => admin.from('creator_stripe_accounts').select('account_id').eq('creator_id',user.id).eq('live',true).maybeSingle();
    const mapping = await lookup();
    if (mapping.error) throw mapping.error;
    let account = mapping.data?.account_id;
    async function stripe(path:string, params?:Record<string,string>, extra:Record<string,string>={}) {
      const headers = {Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20',...extra};
      const response=await fetch('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers,body:params?new URLSearchParams(params):undefined});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error?.code || 'Stripe request failed');
      return result;
    }
    if (!account && action==='connect') {
      const created = await stripe('accounts',{
        type:'express',country:'US','metadata[creator_id]':user.id,
        'capabilities[card_payments][requested]':'true','capabilities[transfers][requested]':'true',
        'settings[payouts][schedule][interval]':'monthly','settings[payouts][schedule][monthly_anchor]':'15'
      },{'Idempotency-Key':'coachline-us-express-'+user.id});
      const saved = await admin.from('creator_stripe_accounts').upsert({creator_id:user.id,live:true,account_id:created.id},{onConflict:'creator_id,live',ignoreDuplicates:true});
      if (saved.error) throw saved.error;
      const current = await lookup();
      if (!current.data) throw Error('Account mapping unavailable');
      account = current.data.account_id;
    }
    if (!account) return unavailable('unconnected','Set up Stripe payouts first.');
    const acct = await stripe('accounts/'+account);
    const schedule = acct.settings?.payouts?.schedule;
    const verified = acct.charges_enabled && acct.payouts_enabled && acct.capabilities?.transfers==='active';
    const monthly = schedule?.interval==='monthly' && schedule.monthly_anchor===15;
    const ready = verified && monthly;
    if (action==='connect') {
      const back = site+'/dashboard.html#settings/payments';
      if (!monthly) await stripe('accounts/'+account,{'settings[payouts][schedule][interval]':'monthly','settings[payouts][schedule][monthly_anchor]':'15'});
      const link = verified ? await stripe('accounts/'+account+'/login_links',{}) :
        await stripe('account_links',{account,return_url:back,refresh_url:back,type:'account_onboarding'});
      return json({url:link.url});
    }
    if (!ready && (action==='checkout' || !acct.details_submitted)) return unavailable('onboarding','Finish setting up Stripe payouts first.');
    if (action==='checkout') {
      const price=await caller.from('coach_pricing').select('weekly_cents,annual_cents,one_time_cents').eq('creator_id',user.id).maybeSingle();
      if (price.error) throw price.error;
      const weekly = price.data?.weekly_cents ?? 399;
      const annual = price.data?.annual_cents ?? 14600;
      async function checkout(interval: 'week' | 'year' | 'once', cents: number) {
        const session = await stripe('checkout/sessions', {
          mode: interval === 'once' ? 'payment' : 'subscription',
          ...(interval === 'once' ? {
            'invoice_creation[enabled]':'true',
            'invoice_creation[invoice_data][metadata][creator_id]':user!.id,
            'invoice_creation[invoice_data][metadata][coachline_plan]':'one_time',
            'customer_creation':'always',
            'payment_intent_data[transfer_data][destination]':account,
            'payment_intent_data[transfer_data][amount]':String(Math.round(cents*0.8))
          } : {
            'line_items[0][price_data][recurring][interval]':interval,
            'subscription_data[metadata][creator_id]':user!.id,
            'subscription_data[transfer_data][destination]':account,
            'subscription_data[transfer_data][amount_percent]':'80'
          }) as Record<string,string>,
          'line_items[0][quantity]': '1',
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][unit_amount]': String(cents),
          'line_items[0][price_data][product_data][name]': 'AI coaching',
          'metadata[creator_id]': user!.id,
          success_url: site + '/',
          cancel_url: site + '/'
        });
        return session.url as string;
      }
      const single = price.data?.one_time_cents ?? 23000;
      const [week, year, once] = await Promise.all([checkout('week', weekly), checkout('year', annual), checkout('once', single)]);
      const offer = new URLSearchParams({week, year, once, annual:String(annual), single:String(single), cents: String(weekly)});
      return json({url: site + '/plans.html#' + offer});

    }
    async function list(path:string, scoped=false) {
      const rows=[];
      let cursor='';
      do {
        const page=await stripe(path+(path.includes('?')?'&':'?')+'limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''),undefined,scoped?{'Stripe-Account':account}:{});
        rows.push(...page.data);
        cursor=page.has_more ? page.data.at(-1).id : '';
      } while(cursor);
      return rows;
    }
    const [invoices, subscriptions, payouts] = await Promise.all([
      list('invoices?expand[]=data.charge.transfer'), list('subscriptions?status=active'), list('payouts',true)
    ]);
    const payments = invoices.filter(i => i.currency === 'usd' &&
      (i.subscription_details?.metadata?.creator_id === user.id || (i.metadata?.coachline_plan === 'one_time' && i.metadata.creator_id === user.id)) && i.charge && typeof i.charge === 'object')
      .map(i => {
        const charge = i.charge;
        const paid = charge.amount_captured;
        const refunded = charge.amount_refunded;
        return {date:day(charge.created), type:i.metadata?.coachline_plan==='one_time'?'One-time payment':i.billing_reason==='subscription_create'?'First payment':'Subscription payment',
          client:{name:i.customer_name || 'Client', digits:(i.customer_phone || '').slice(-4)},
          status:refunded ? (refunded===paid?'Refunded':'Partially refunded') : charge.status==='succeeded'?'Paid':charge.status==='failed'?'Failed':'Pending',
          paid,refunded,earnings:charge.transfer?.destination===account ? charge.transfer.amount-charge.transfer.amount_reversed : 0};
      });
    return json({state:ready?'connected':'onboarding',live,
      clients:new Set(subscriptions.filter(s=>s.metadata?.creator_id===user.id).map(s=>s.customer)).size,
      total:payments.reduce((n,p)=>n+p.earnings,0),
      entries:payments.map(p=>({date:p.date,net:p.earnings})), payments,payouts:payouts.filter(p=>p.currency==='usd').map(p=>({id:p.id,date:day(p.arrival_date),amount:p.amount,status:({paid:'Deposited',in_transit:'On the way',pending:'Scheduled',failed:'Failed',canceled:'Canceled'} as Record<string,string>)[p.status] || p.status}))});
  } catch (err) {
    console.error('Billing request failed',err instanceof Error?err.message:'backend error');
    return json({error:'Stripe could not complete this request. Please try again.'},502);
  }
});
