const params=new URLSearchParams(location.hash.slice(1));
const plans=document.querySelector('#plans'), pay=document.querySelector('#pay'), note=document.querySelector('#notice');
const preview=params.has('preview'), legacy=params.has('week');
let ticket=params.get('intake'), offer=params.get('offer');
if(ticket||offer){
  sessionStorage.setItem('coachline-checkout-resume',ticket||'');
  sessionStorage.setItem('coachline-offer-resume',offer||'');
}else if(!location.hash){
  ticket=sessionStorage.getItem('coachline-checkout-resume');
  offer=sessionStorage.getItem('coachline-offer-resume');
}
let simulating=preview;
let prices, available=false, selected=preview && ['once','year','week'].includes(params.get('plan'))?params.get('plan'):'once';
const currency=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const titles={year:'Annual coaching',week:'Weekly coaching',once:'One-time payment'};
function checkoutUrl(value){
  try{const url=new URL(value);return url.origin==='https://checkout.stripe.com' && url.pathname.startsWith('/c/pay/') ? url.href : null;}catch{return null;}
}
async function billing(action,extra={}){
  const r=await fetch('https://kvpngwwaemdjwchslcov.supabase.co/functions/v1/creator-billing',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_Ls2Da1rHiPIT8VR-9RbSGw_FkS_ofgL'},
    body:JSON.stringify({action:(offer?'offer-':'intake-')+action,ticket,offer,...extra})
  });
  const data=await r.json();
  if(!r.ok)throw Object.assign(new Error(data.error||'Couldn’t load your coach’s plans.'),{changed:data.changed});
  return data;
}
function showTerms(){
  const amount=currency(prices[selected]);
  document.querySelector('#terms').textContent=selected==='once'?amount+' billed once.':amount+' billed every '+selected+'. Renews until canceled.';
  pay.disabled=!available;
}
function draw(){
  plans.replaceChildren();
  if(!prices[selected])selected='year';
  for(const id of ['once','year','week']){
    const amount=prices[id];if(!Number.isInteger(amount)||amount<50)continue;
    const card=document.createElement('div');card.className='card'+(id==='once'?' highlight':'');
    const launch=id==='once' && !legacy && amount===9999;
    const remaining=Number.isInteger(prices.remaining)?' · '+prices.remaining+' left':'';
    card.innerHTML=(launch?'<div class="ribbon">Launch offer · First 5 buyers'+remaining+'</div>':'')+
      '<label><input type="radio" name="plan"><span><strong></strong><small class="caption"></small></span><b class="amount"></b></label><details><summary>Plan details</summary><ul></ul></details>';
    card.querySelector('strong').textContent=titles[id];
    const caption=card.querySelector('.caption');
    caption.textContent=id==='once'?'Lifetime access to your AI coach.':id==='week'?currency(amount*4)+' over four weeks':'A full year of meal scans, workouts, and coach messaging.';
    const price=card.querySelector('.amount');
    price.textContent=currency(amount)+(id==='week'?' / wk':id==='year'?' / yr':'');
    const annualDiscount=id==='year' && Number.isInteger(prices.reference) && Math.round(prices.reference/12)===amount;
    if(launch || annualDiscount){
      const reference=launch?12000:prices.reference;
      card.classList.add('discounted-plan');
      const regular=document.createElement('s');regular.textContent=currency(reference);
      regular.setAttribute('aria-label','Regular price '+currency(reference));
      const current=document.createElement('span');current.textContent=price.textContent;
      const discount=document.createElement('small');discount.className='discount';discount.textContent=launch?'Save '+currency(reference-amount):'91.67% off';
      price.replaceChildren(regular,' ',current,' ',discount);
    }
    const radio=card.querySelector('input');radio.value=id;radio.checked=id===selected;
    radio.onchange=()=>{selected=id;showTerms();};
    const list=card.querySelector('ul');
    for(const item of ['Calorie tracking and meal scans','Gym equipment scans and workout guidance','Messaging with your AI coach','Unlimited AI coach calls']){
      const li=document.createElement('li'), mark=document.createElement('span');
      const calling=item.startsWith('Unlimited'),excluded=calling && id!=='once';
      mark.textContent=excluded?'✕':'✓';mark.setAttribute('aria-hidden','true');li.append(mark);
      const text=document.createElement(excluded?'s':'bdi');text.textContent=item;li.append(text);
      if(excluded){li.className='excluded';li.append(' · Excluded');}
      else if(calling)li.append(' · When calling launches');
      list.append(li);
    }
    plans.append(card);
  }
  showTerms();
}
async function load(){
  if(preview){sessionStorage.removeItem('coachline-preview-line');prices={week:799,year:3199,once:9999,reference:38388};available=true;pay.textContent='Preview checkout';note.textContent='Try checkout without making a payment.';}
  else if(legacy){
    const extended=params.has('once');
    const week=Number(params.get('cents'));
    prices={week,year:extended?Number(params.get('annual')):Math.round(week*52*.65),once:extended?Number(params.get('single')):null,reference:params.has('reference')?Number(params.get('reference')):null};
    available=(extended?['week','year','once']:['week','year']).every(id=>Number.isSafeInteger(prices[id])&&prices[id]>=50&&checkoutUrl(params.get(id)));
    if(!available)throw Error('Ask your coach for a fresh checkout link.');
  }else if(ticket||offer){
    const result=await billing('prices');
    const messages=document.querySelector('#messages');
    const hasLine=/^\+[1-9]\d{7,14}$/.test(result.coachPhone);
    if(hasLine)messages.href='sms:'+result.coachPhone;
    if(result.active){
      available=false;plans.replaceChildren();pay.hidden=true;
      document.querySelector('#terms').textContent='';
      note.textContent='Your coaching plan is active. Return to your conversation to get started.';
      messages.hidden=!hasLine;return;
    }
    if(result.simulation){
      if(hasLine)sessionStorage.setItem('coachline-preview-line',result.coachPhone);
      else sessionStorage.removeItem('coachline-preview-line');
      simulating=true;available=true;prices=result.prices;pay.textContent='Preview checkout';
      note.textContent='Try the payment-free preview, then return to Messages.';draw();return;
    }
    prices=result.prices;available=result.available;
    document.querySelector('#messages').hidden=available;
    note.textContent=available?'':(ticket?'Your profile is saved. ':'')+'Your coach is still setting up payments.';
  }else throw Error('Open the personal link from your coaching conversation to see your plans.');
  draw();
}
pay.onclick=async()=>{
  if(!available)return;
  pay.disabled=true;plans.disabled=true;note.textContent='Opening Stripe…';
  try{
    if(simulating){
      if(ticket && !preview){
        const checkout=new URLSearchParams({preview:selected,intake:ticket});
        location.assign('./payment.html#'+checkout);
        return;
      }
      const response=await fetch('https://kvpngwwaemdjwchslcov.supabase.co/functions/v1/checkout-status',{
        method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_Ls2Da1rHiPIT8VR-9RbSGw_FkS_ofgL'},
        body:JSON.stringify({action:'preview',plan:selected,attempt:crypto.randomUUID()})
      });
      if(!response.ok)throw Error('Couldn’t open the checkout preview. Please try again.');
      const sandbox=await response.json();
      if(sandbox.demo===true){location.assign('./payment.html#preview='+selected);return;}
      const url=checkoutUrl(sandbox.url);
      if(!url)throw Error('Couldn’t open the Stripe sandbox.');
      location.assign(url);return;
    }
    const result=legacy?{url:params.get(selected)}:await billing('checkout',{plan:selected,expectedCents:prices[selected]});
    const url=checkoutUrl(result.url);if(!url)throw Error('Ask your coach for a new checkout link.');
    location.assign(url);
  }catch(err){
    if(err.changed){available=false;await load().catch(()=>{document.querySelector('#retry').hidden=false;});}
    note.textContent=err.message;pay.disabled=!available;plans.disabled=false;
  }
};
window.addEventListener('pageshow',event=>{if(event.persisted && available){pay.disabled=false;plans.disabled=false;note.textContent='';}});
load().catch(err=>{note.textContent=err.message;document.querySelector('#retry').hidden=false;pay.disabled=true;});
