import {db} from './supabase-client.js';

const titles={
  joined:'Onboarding', client:'Client', coach:'AI coach', meal:'Meal plan', meal_log:'Meal logged', workout:'Workout plan',
  friday:'Friday check-in', review:'Coach feedback', progress:'Progress photo', checkin_note:'Client check-in',
  workout_done:'Workout completed', burn:'Workout calories', burn_file:'Tracker screenshot',
  burn_review:'Screenshot needs clarification', attention:'Trainer review', allergies:'Food allergies'
};
const time=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
function element(tag,text,className){
  const el=document.createElement(tag);
  el.textContent=text;
  if(className)el.className=className;
  return el;
}
export async function updateCoachingCounts(){
  const [{data,error},leads,pilot]=await Promise.all([db.rpc('creator_coaching_counts'),db.rpc('creator_page_leads'),db.rpc('pilot_dashboard_counts')]);
  const leadCount=document.querySelector('#page-leads');
  if(leadCount&&!leads.error){leadCount.textContent=leads.data+' pending page '+(leads.data===1?'lead':'leads');leadCount.hidden=false;}
  if(error||!data)return;
  const badge=document.querySelector('#clients-unread');
  badge.textContent=data.unread;
  badge.hidden=!data.unread;
  badge.parentElement.setAttribute('aria-label',data.unread?'Clients, '+data.unread+' with new activity':'Clients');
  if(pilot.error || !pilot.data) return;
  document.querySelector('#creator-pilot-total').textContent=pilot.data.mine;
  document.querySelector('#active-clients').textContent=pilot.data.active;
  const progress=document.querySelector('.invite progress');
  progress.value=Math.min(pilot.data.filled,progress.max);
  const count=document.querySelector('#pilot-joined');
  count.textContent=pilot.data.filled+' of '+progress.max+' pilot spots filled';
}
export function startCoachingCounts(){
  updateCoachingCounts();
  window.addEventListener('focus',updateCoachingCounts);
  setInterval(()=>{if(!document.hidden)updateCoachingCounts();},30000);
}
export async function openCoachingFeed(client){
  const panel=document.querySelector('#panel'),dialog=panel.closest('dialog');
  document.querySelector('#panelTitle').textContent=client.name+' · Coaching';
  const root=element('div','','coaching-feed');
  const plans=element('section',''),feed=element('section',''),entries=element('div','');
  const more=element('button','Earlier activity'),status=element('p','Loading coaching records…');
  more.type='button';more.hidden=true;
  feed.append(element('h3','Messages and activity'),entries,more);
  root.append(plans,feed,status);panel.replaceChildren(root);dialog.showModal();
  let oldest=null,busy=false;
  const urls=new Set();
  const alive=()=>dialog.open&&root.isConnected;
  function entry(a){
    const card=element('article','','coaching-entry');
    const header=element('header','');
    header.append(element('strong',titles[a.kind]||'Activity'),element('time',time(a.created_at)));
    card.append(header,element('p',a.body));
    if(a.kind==='burn'&&a.workout_date)card.append(element('small','Workout date · '+a.workout_date));
    if(a.asset){
      const button=element('button',a.kind==='progress'?'View progress photo':'View workout screenshot');
      button.type='button';
      button.onclick=async()=>{
        button.disabled=true;
        const {data,error}=await db.storage.from('client-progress').download(a.asset);
        if(!alive())return;
        if(error){button.disabled=false;button.textContent='Retry image';return;}
        const img=document.createElement('img'),url=URL.createObjectURL(data);
        urls.add(url);img.src=url;img.alt=a.kind==='progress'?'Client progress photo':'Client workout screenshot';img.className='client-file';
        button.replaceWith(img);
      };
      card.append(button);
    }
    return card;
  }
  async function refresh(older=false){
    if(busy||!alive())return;
    busy=true;more.disabled=true;
    try{
      const [activity,latest]=await Promise.all([
        db.rpc('creator_client_activity',{client:client.id,before_id:older?oldest:null}),
        older?Promise.resolve(null):db.rpc('creator_current_plans',{client:client.id})
      ]);
      if(!alive())return;
      if(activity.error||latest?.error)throw Error();
      if(latest){
        plans.replaceChildren(element('h3','Current plans'),...latest.data.map(entry));
        if(!latest.data.length)plans.append(element('p','Plans appear here when the coach sends them.'));
      }
      const rows=activity.data;
      if(older)entries.append(...rows.map(entry));
      else{
        entries.replaceChildren(...rows.map(entry));
        if(!rows.length)entries.append(element('p','Client activity will appear here.'));
      }
      oldest=rows.at(-1)?.id||oldest;
      more.hidden=rows.length<50;
      status.textContent='';
      if(!older&&rows.length){
        const marked=await db.rpc('creator_read_activity',{client:client.id,through_id:rows[0].id});
        if(!marked.error){updateCoachingCounts();window.dispatchEvent(new CustomEvent('coaching-read',{detail:client.id}));}
      }
    }catch{if(alive())status.textContent='Couldn’t load coaching records. Reopen the client to retry.';}
    finally{busy=false;more.disabled=false;}
  }
  more.onclick=()=>refresh(true);
  // Preserve expanded photos and older pages while the trainer is reading.
  const refreshButton=element('button','Refresh activity');
  refreshButton.onclick=()=>refresh();root.prepend(refreshButton);
  const timer=setInterval(()=>{
    if(!document.hidden&&alive()&&!urls.size&&entries.children.length<=50)refresh();
  },30000);
  dialog.addEventListener('close',()=>{clearInterval(timer);urls.forEach(url=>URL.revokeObjectURL(url));root.remove();},{once:true});
  await refresh();
}
