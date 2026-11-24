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
  let testMode = false;
  const labels = {setup:'Platform setup pending',connected:'Coachline checkout ready'};
  async function refresh() {
    try {
      const result = await request('status');
      testMode = result.live === false;
      const status = labels[result.state] + (result.live === false ? ' · Test mode' : '');
      setup.textContent = status;
      checkout.disabled = result.state !== 'connected';
      checkout.textContent = testMode ? 'Create test checkout link' : 'Create client checkout link';
      updateIncome(result,status);
      return result;
    } catch (err) {
      checkout.disabled = true;
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
      feedback.textContent=testMode ? 'Test checkout link. Use a Stripe test card.' : 'Share this link with one client. It expires in 24 hours.';
    } catch(err) {feedback.textContent=err.message;}
    finally {checkout.disabled=false;}
  };
  save.onsubmit = async event => {
    event.preventDefault();
    const cents=Math.round(Number(price.value)*100);
    const button=save.querySelector('button');
    button.disabled=true;
    try {
      const {error}=await db.from('coach_pricing').upsert({creator_id:user.id,weekly_cents:cents, annual_cents:Math.round(annualPrice.valueAsNumber*100), one_time_cents:Math.round(oneTimePrice.valueAsNumber*100)});
      if (error) throw error;
      feedback.textContent='Prices saved for new checkouts.';
      byId('checkout-link').hidden=true;
    } catch(err) {feedback.textContent=err.message;}
    finally {button.disabled=false;}
  };
  const loadPrice=async()=>{
    const {data,error}=await db.from('coach_pricing').select('weekly_cents,annual_cents,one_time_cents').eq('creator_id',user.id).maybeSingle();
    if (error) throw error;
    price.value=((data?.weekly_cents ?? 399)/100).toFixed(2);
    annualPrice.value=((data?.annual_cents ?? 14600)/100).toFixed(2);
    oneTimePrice.value=((data?.one_time_cents ?? 23000)/100).toFixed(2);
    price.disabled=annualPrice.disabled=oneTimePrice.disabled=false;save.querySelector('button').disabled=false;
  };
  loadPrice().catch(()=>{feedback.textContent='Could not load pricing. Reload to retry.';});
  await refresh();
  window.addEventListener('focus',refresh);
}
