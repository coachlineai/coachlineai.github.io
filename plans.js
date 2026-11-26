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
let prices, available=false, selected='once';
const currency=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const titles={year:'Annual coaching',week:'Weekly coaching',once:'Lifetime training'};
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
    card.innerHTML=(id==='once'?'<div class="ribbon">Lifetime access · One payment</div>':'')+
      '<label><input type="radio" name="plan"><span><strong></strong><small class="caption"></small></span><b class="amount"></b></label><details><summary>Plan details</summary><ul></ul></details>';
    card.querySelector('strong').textContent=titles[id];
    const caption=card.querySelector('.caption');
    caption.textContent=id==='once'?'Pay once':id==='week'?currency(amount*4)+' over four weeks':'Billed once a year';
    if(id==='year' && Number.isInteger(prices.reference) && Math.round(prices.reference/12)===amount){
      caption.replaceChildren();const base=document.createElement('s');base.textContent=currency(prices.reference);
      const discount=document.createElement('span');discount.className='discount';discount.textContent='91.67% off';
      caption.append(base,' · ',discount);
    }
    card.querySelector('.amount').textContent=currency(amount)+(id==='week'?' / wk':id==='year'?' / yr':'');
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
    // Make the calling availability visible before expanding the details.
    if(id==='once'){
      caption.textContent='Train with your AI coach for life.';
      if(!legacy){
        const offerInfo=document.createElement('div');offerInfo.className='launch-pricing';
        const early=amount===9999;
        const availability=early && Number.isInteger(prices.remaining)?' · '+prices.remaining+' left':'';
        offerInfo.innerHTML='<div class="tier"><b>$99.99</b><small></small></div><div class="tier"><b>$120</b><small>Regular lifetime price</small></div>';
        const [launch,regular]=offerInfo.children;
        launch.querySelector('small').textContent=early?'First 5 buyers'+availability:'First 5 · Sold out';
        (early?launch:regular).classList.add('current');
        if(!early)launch.classList.add('sold-out');
        card.querySelector('details').before(offerInfo);
      }
    }
    plans.append(card);
  }
  showTerms();
}
async function load(){
  if(preview){prices={week:799,year:3196,once:9999,reference:38352};note.textContent='Preview prices. Open your personal setup link to see your coach’s offer.';}
  else if(legacy){
    const extended=params.has('once');
    const week=Number(params.get('cents'));
    prices={week,year:extended?Number(params.get('annual')):Math.round(week*52*.65),once:extended?Number(params.get('single')):null,reference:params.has('reference')?Number(params.get('reference')):null};
    available=(extended?['week','year','once']:['week','year']).every(id=>Number.isSafeInteger(prices[id])&&prices[id]>=50&&checkoutUrl(params.get(id)));
    if(!available)throw Error('Ask your coach for a fresh checkout link.');
  }else if(ticket||offer){
    const result=await billing('prices');prices=result.prices;available=result.available;
    document.querySelector('#messages').hidden=available;
    note.textContent=available?'':(ticket?'Your profile is saved. ':'')+'Your coach is still setting up payments.';
  }else throw Error('Open the personal link from your coaching conversation to see your plans.');
  draw();
}
pay.onclick=async()=>{
  if(!available)return;
  pay.disabled=true;plans.disabled=true;note.textContent='Opening Stripe…';
  try{
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
