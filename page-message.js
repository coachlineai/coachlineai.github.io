import {SUPABASE_URL,PUBLISHABLE_KEY} from './supabase-client.js';

// Reuse the lead on this browser so reopening Messages or tapping the number
// and the main button does not count the same visit twice.
export function wirePageMessage(doc,slug,displayName){
  const links=doc.querySelectorAll('.contact a[href^="sms:"]');
  if(!links.length)return;
  const key='coachline-page-lead:'+slug;
  let id=crypto.randomUUID();
  try{
    const saved=localStorage.getItem(key);
    if(/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(saved||''))id=saved;
    else localStorage.setItem(key,id);
  }catch{/* The link still works when storage is unavailable. */}
  const firstName=displayName?.trim().split(/\s+/u)[0];
  const message=firstName?'What’s up, '+firstName+'?':'What’s up?';
  for(const link of links){
    link.href=link.getAttribute('href')+'?body='+encodeURIComponent(message);
    link.addEventListener('click',()=>{
      try { localStorage.setItem('coachline-last-page-click',id); } catch {}
      fetch(SUPABASE_URL+'/rest/v1/rpc/record_creator_page_click',{
        method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({page_slug:slug,click_id:id}),keepalive:true
      }).catch(()=>{});
    });
  }
}
