const el=id=>document.getElementById(id);
const params=new URLSearchParams(location.hash.slice(1));
const offers={
  once:{name:'Lifetime coaching',caption:'One payment for lifetime coaching access.',amount:9999},
  year:{name:'Annual coaching',caption:'Renews every year until canceled.',amount:3199},
  week:{name:'Weekly coaching',caption:'Renews every week until canceled.',amount:799}
};
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const endpoint='https://kvpngwwaemdjwchslcov.supabase.co/functions/v1/checkout-status';
function button(label,handler){
  el('action').textContent=label;
  el('action').onclick=handler;
  el('action').hidden=false;
}
function order(plan,cents,preview){
  const offer=offers[plan];
  if(!offer || !Number.isSafeInteger(cents))throw Error('Unknown plan');
  el('name').textContent=money(cents);
  el('caption').textContent=offer.caption;
  const launch=plan==='once' && cents===9999;
  const rows=[[offer.name,launch?'$120.00':money(cents)]];
  if(launch)rows.push(['Launch discount','−$20.01']);
  rows.push([preview?'Demo total':'Amount paid',money(cents)]);
  const list=el('totals');
  list.replaceChildren();
  for(const [name,amount] of rows){
    const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=name;dd.textContent=amount;row.append(dt,dd);list.append(row);
  }
  list.hidden=false;
}
function demoComplete(){
  el('heading').textContent='Ready to head back to Messages?';
  el('message').textContent='Your preview is complete. You can message your coach about setup. Personal coaching starts after payment.';
  el('action').hidden=true;
  const coachLine=sessionStorage.getItem('coachline-preview-line');
  el('sms').href='sms:'+(/^\+[1-9]\d{7,14}$/.test(coachLine)?coachLine:'+16177106179');
  el('sms').hidden=false;
}
async function confirmPayment(){
  el('action').hidden=true;
  el('heading').textContent='Checking your payment…';
  el('message').textContent='';
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_Ls2Da1rHiPIT8VR-9RbSGw_FkS_ofgL'},body:JSON.stringify({session:params.get('session')})});
    if(!response.ok)throw Error('Could not verify session');
    const result=await response.json();
    if(result.state==='active'){
      order(result.plan,result.amount,result.demo);
      if(result.demo){el('sample').hidden=false;el('back').href='./plans.html#preview';demoComplete();return;}
      el('heading').textContent='Payment confirmed';
      el('message').textContent='Your coaching plan is active. Return to your conversation to get started.';
      if(/^\+[1-9]\d{7,14}$/.test(result.coachPhone)){
        el('sms').href='sms:'+result.coachPhone;el('sms').hidden=false;
      }
    }else if(result.state==='ended'){
      el('heading').textContent='This checkout is closed';
      el('message').textContent='You can review the available coaching plans.';
    }else{
      el('heading').textContent='Waiting for payment confirmation';
      el('message').textContent='Your payment is still processing. You can check its status here.';
      button('Check payment status',confirmPayment);
    }
  }catch{
    el('heading').textContent='Payment status unavailable';
    el('message').textContent='Check again before starting another payment.';
    button('Check again',confirmPayment);
  }
}
const plan=params.get('preview');
if(Object.hasOwn(offers,plan)){
  el('back').href='./plans.html#preview&plan='+plan;
  el('sample').hidden=false;
  order(plan,offers[plan].amount,true);
  el('heading').textContent='Preview your checkout';
  el('message').textContent='Try the confirmation step without entering payment details.';
  button('Simulate payment',demoComplete);
}else if(params.has('session'))confirmPayment();
else{
  el('heading').textContent='Open your checkout link';
  el('message').textContent='Your payment confirmation is available from your completed checkout.';
}
