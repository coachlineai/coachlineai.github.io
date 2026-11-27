import {publicDb} from './supabase-client.js';
import {normalizeCreatorPhone} from './creator-contact.js';
const id=s=>document.getElementById(s);
const slug=new URLSearchParams(location.search).get('coach');
const page=await publicDb.from('published_pages').select('content').eq('slug',slug||'').maybeSingle();
const name=page.data?.content?.name?.trim();
if(!name){id('signup').hidden=true;id('status').textContent='Open the link on your coach’s published page.';}
else id('heading').textContent='Start coaching with '+name;
let timer;
let polls=0;
async function check(ref){
  const {data}=await publicDb.rpc('client_registration_line',{browser_ref:ref});
  if(/^\+[1-9]\d{7,14}$/.test(data)){
    id('status').textContent='Send this first text to verify your number and get your personal onboarding link.';
    id('message').onclick=null;id('message').textContent='Open Messages';
    id('message').href='sms:'+data+'?body='+encodeURIComponent('What’s up, '+name.split(/\s+/)[0]+'?');
    id('message').hidden=false;
  }else{
    polls++;
    if(polls>=12){
      id('status').textContent='Your number is still being verified. You can leave this page and come back to check.';
      id('message').textContent='Check messaging setup';id('message').href='#';id('message').hidden=false;
      id('message').onclick=e=>{e.preventDefault();polls=0;id('message').onclick=null;id('message').hidden=true;check(ref);};
    }else timer=setTimeout(()=>check(ref),10000);
  }
}
id('signup').onsubmit=async e=>{
  e.preventDefault();
  const mobile=normalizeCreatorPhone(id('mobile').value);
  if(!mobile){id('status').textContent='Enter a mobile number with its country code.';return;}
  id('submit').disabled=true;
  const ref=crypto.randomUUID();
  const {error}=await publicDb.rpc('request_client_messaging',{page_slug:slug,mobile,consent:id('agree').checked,old_enough:id('age').checked,browser_ref:ref});
  if(error){id('status').textContent=error.message.includes('pilot spots')?'All eight pilot spots have been reserved.':'Messaging setup could not start. Please try again.';id('submit').disabled=false;return;}
  id('signup').hidden=true;id('status').textContent='We’re setting up your number. Keep this page open until the Messages button appears.';
  clearTimeout(timer);await check(ref);
};
