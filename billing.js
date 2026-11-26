import {db} from './supabase-client.js';

export async function initBilling(user, updateIncome) {
  const byId = id => document.getElementById(id);
  const setup = byId('stripe-help');
  const price = byId('coach-price');
  const annualPrice = byId('annual-price');
  const oneTimePrice = byId('one-time-price');
  const save = byId('save-price');
  const checkout = byId('coach-checkout');
  const feedback = byId('price-status');
  async function request(action) {
    const {data,error} = await db.functions.invoke('creator-billing',{body:{action}});
    if (error || data?.error) throw Error(data?.error || 'Billing is unavailable. Please retry.');
    return data;
  }
  const connect = byId('stripe-connect');
  const labels = {setup:'Coachline live payments setup pending',demo:'Demo account · Live payments disabled',unconnected:'Set up Stripe payouts to accept payments',onboarding:'Stripe setup incomplete or under review',connected:'Stripe payouts enabled · Monthly on the 15th'};
  let connecting = false;
  connect.onclick = async () => {
    connecting = true;
    connect.disabled = true;
    try {
      const result = await request('connect');
      const target = new URL(result.url);
      if (target.protocol !== 'https:' || !target.hostname.endsWith('.stripe.com')) throw Error('Invalid onboarding link.');
      location.assign(target.href);
    } catch (err) {
      connecting = false;
      connect.disabled = false;
      setup.textContent = err.message;
    }
  };
  async function refresh() {
    try {
      const result = await request('status');
      const status = labels[result.state] || 'Payments unavailable';
      setup.textContent = status;
      connect.disabled = connecting || !['unconnected','onboarding','connected'].includes(result.state);
      connect.textContent = result.state==='connected' ? 'Manage Stripe payouts' : result.state==='onboarding' ? 'Continue Stripe setup' : 'Set up US payouts with Stripe';
      checkout.disabled = result.state !== 'connected';
      if (checkout.disabled) byId('checkout-link').hidden=true;
      updateIncome(result,status);
      return result;
    } catch (err) {
      checkout.disabled = true;
      connect.disabled = true;
      setup.textContent = err.message;
      updateIncome({state:'error'},'Could not load Stripe data');
    }
  }
  checkout.onclick = async () => {
    checkout.disabled=true;
    try {
      const data=await request('checkout');
      if (!data.url) throw Error('Checkout is unavailable. Please retry.');
      const link=byId('checkout-link');
      link.hidden=false;link.value=data.url;link.select();
      feedback.textContent='Share this link with one client. It expires in 24 hours.';
    } catch(err) {feedback.textContent=err.message;}
    finally {await refresh();}
  };
  save.onsubmit = async event => {
    event.preventDefault();
    const cents=Math.round(Number(price.value)*100);
    const button=save.querySelector('button');
    button.disabled=true;
    try {
      const {error}=await db.from('coach_pricing').upsert({creator_id:user.id,weekly_cents:cents, annual_cents:Math.round(annualPrice.valueAsNumber*100)});
      if (error) throw error;
      feedback.textContent='Prices saved for new checkouts.';
      byId('checkout-link').hidden=true;
    } catch(err) {feedback.textContent=err.message;}
    finally {button.disabled=false;}
  };
  function updateAnnualPreview(){
    const base = Math.round(annualPrice.valueAsNumber * 100);
    byId('annual-preview').textContent = annualPrice.validity.valid && Number.isFinite(base)
      ? 'Client pays $' + (Math.round(base / 12) / 100).toFixed(2) + ' per year (91.67% off).'
      : 'Enter an annual reference price of at least $6.';
  }
  annualPrice.addEventListener('input',updateAnnualPreview);
  const loadPrice=async()=>{
    const {data,error}=await db.from('coach_pricing').select('weekly_cents,annual_cents,one_time_cents').eq('creator_id',user.id).maybeSingle();
    if (error) throw error;
    price.value=((data?.weekly_cents ?? 799)/100).toFixed(2);
    annualPrice.value=((data?.annual_cents ?? 38352)/100).toFixed(2);
    oneTimePrice.value=((data?.one_time_cents ?? 12000)/100).toFixed(2);
    price.disabled=annualPrice.disabled=false;updateAnnualPreview();save.querySelector('button').disabled=false;
  };
  loadPrice().catch(()=>{feedback.textContent='Could not load pricing. Reload to retry.';});
  await refresh();
  window.addEventListener('focus',refresh);
}
