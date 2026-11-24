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
    if (!['status','checkout'].includes(action)) return json({error:'Unknown action'},400);
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    const live = key?.startsWith('sk_live_') || key?.startsWith('rk_live_');
    if (!live) {
      if (action === 'checkout') return json({error:'Live checkout is pending activation.'},503);
      return json({state:'setup',total:0,clients:0,entries:[],payments:[],payouts:[]});
    }
    async function stripe(path:string, params?:Record<string,string>) {
      const headers:Record<string,string> = {Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20'};
      const response=await fetch('https://api.stripe.com/v1/'+path,{method:params?'POST':'GET',headers,body:params?new URLSearchParams(params):undefined});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error?.code || 'Stripe request failed');
      return result;
    }
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
            'customer_creation':'always'
          } : {
            'line_items[0][price_data][recurring][interval]':interval,
            'subscription_data[metadata][creator_id]':user!.id
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
    async function list(path:string) {
      const rows=[];
      let cursor='';
      do {
        const page=await stripe(path+(path.includes('?')?'&':'?')+'limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''));
        rows.push(...page.data);
        cursor=page.has_more ? page.data.at(-1).id : '';
      } while(cursor);
      return rows;
    }
    const [invoices, subscriptions] = await Promise.all([
      list('invoices?expand[]=data.charge'), list('subscriptions?status=active')
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
          paid,refunded,earnings:paid-refunded};
      });
    return json({state:'connected',live,
      clients:new Set(subscriptions.filter(s=>s.metadata?.creator_id===user.id).map(s=>s.customer)).size,
      total:payments.reduce((n,p)=>n+p.earnings,0),
      entries:payments.map(p=>({date:p.date,net:p.earnings})), payments,payouts:[]});
  } catch (err) {
    console.error('Billing request failed',err instanceof Error?err.message:'backend error');
    return json({error:'Stripe could not complete this request. Please try again.'},502);
  }
});
