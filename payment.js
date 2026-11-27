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
const intake=params.get('intake') || (params.has('preview') && sessionStorage.getItem('coachline-preview-line') ? sessionStorage.getItem('coachline-checkout-resume') : null);
const personalDemo=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(intake||'');
function publicDemoComplete(){
  el('heading').textContent='Checkout preview complete';
  el('message').textContent='For coaching based on your own answers, text your coach for a personal onboarding link.';
  el('action').hidden=true;
  const coachLine=sessionStorage.getItem('coachline-preview-line');
  el('sms').href='sms:'+(/^\+[1-9]\d{7,14}$/.test(coachLine)?coachLine:'+16177106179');
  el('sms').hidden=false;
}
async function startDemoCoaching(){
  if(!el('consent').checked || el('action').disabled)return;
  el('action').disabled=true;
  el('message').textContent='Connecting your coaching conversation…';
  try{
    const response=await fetch('https://kvpngwwaemdjwchslcov.supabase.co/functions/v1/creator-billing',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',apikey:'sb_publishable_Ls2Da1rHiPIT8VR-9RbSGw_FkS_ofgL'},
      body:JSON.stringify({action:'intake-simulate',ticket:intake,consent:true,plan,expectedCents:Number(params.get('cents')||offers[plan].amount)})
    });
    const result=await response.json();
    if(!response.ok){el('message').textContent=result.error||'Couldn’t start your chat. Try again.';return;}
    const line=result.line;
    if(typeof line!=='string'||!/^\+[1-9]\d{7,14}$/.test(line))throw Error('link');
    el('heading').textContent='Your coaching chat is ready';
    el('message').textContent=result.manual?'Your demo is ready. Open Messages and say hello to start coaching. No charge was made.':'Your AI coach has your onboarding answers. Open Messages to continue the conversation. No charge was made.';
    el('action').hidden=true;
    el('consent-row').hidden=true;
    el('sms').href='sms:'+line;
    el('sms').hidden=false;
  }catch(error){
    el('message').textContent=error.message==='link'?'Open a fresh personal link from your coach to start this demo.':'Couldn’t connect your chat. Tap Simulate payment to try again.';
  }finally{el('action').disabled=false;}
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
      if(result.demo){el('sample').hidden=false;el('back').href='./plans.html#preview';publicDemoComplete();return;}
      if(result.sandbox){
        el('heading').textContent='Test payment confirmed';
        el('message').textContent='Your coach has your questionnaire and is preparing your meals and workouts. No money was charged.';
        if(/^\+[1-9]\d{7,14}$/.test(result.coachPhone)){el('sms').href='sms:'+result.coachPhone;el('sms').hidden=false;}
        return;
      }
      el('heading').textContent='Payment confirmed';
      el('message').textContent='Your plan is active. To get personalized plans and Friday check-ins, text COACH ON. Your AI coach uses your questionnaire and any check-in photos or workout screenshots you share. Your trainer can see them. You can text COACH OFF anytime.';
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
  order(plan,personalDemo?Number(params.get('cents')||offers[plan].amount):offers[plan].amount,true);
  el('heading').textContent='Preview your checkout';
  el('message').textContent='Try the confirmation step without entering payment details.';
  if(personalDemo){
    el('back').href='./plans.html#intake='+encodeURIComponent(intake);
    el('heading').textContent='Start your coaching demo';
    el('message').textContent='Simulate this payment to start your personalized coaching plan. No card or charge.';
    el('consent-row').hidden=false;
    button('Simulate payment',startDemoCoaching);
    el('action').disabled=!el('consent').checked;
    el('consent').onchange=()=>{el('action').disabled=!el('consent').checked;};
  }else button('Simulate payment',publicDemoComplete);
}else if(params.has('session'))confirmPayment();
else{
  el('heading').textContent='Open your checkout link';
  el('message').textContent='Your payment confirmation is available from your completed checkout.';
}
