import {nutritionEstimate} from './nutrition.js';
const $=s=>document.querySelector(s);
const api='https://kvpngwwaemdjwchslcov.supabase.co/rest/v1/rpc/';
const key='sb_publishable_Ls2Da1rHiPIT8VR-9RbSGw_FkS_ofgL';
const valid=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const params=new URLSearchParams(location.hash.slice(1));
let token=params.get('access');
const preview=location.search==='?preview';
try {
 if(token && valid.test(token)){sessionStorage.setItem('client-progress',token);history.replaceState(null,'',location.pathname+location.search);}
 else if(!token)token=sessionStorage.getItem('client-progress');
}catch{}
const local=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const today=()=>local(new Date());
const date=s=>new Date(s+'T12:00:00');
function shift(s,n){const d=date(s);d.setDate(d.getDate()+n);return local(d);}
const fmt=(s,options)=>date(s).toLocaleDateString(undefined,options);
const eventDay=e=>e.day||local(new Date(e.at));
let selected=today(), tab=params.get('view')==='progress'?'Progress':params.get('view')==='calendar'?'Calendar':'Today',monthOpen=false,filter='All',data=null,entry=null,loading=false;
function el(parent,type,text,cls){const node=document.createElement(type);if(text!=null)node.textContent=text;if(cls)node.className=cls;parent.append(node);return node;}
function btn(parent,text,action,cls='soft'){const b=el(parent,'button',text,cls);b.type='button';b.onclick=action;return b;}
function card(parent){return el(parent,'section',null,'card');}
async function rpc(name,args){const response=await fetch(api+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({ticket:token,...args})});if(!response.ok)throw Error('network');return response.json();}
function go(value){tab=value;document.body.classList.remove('menu-open');$('#menu').setAttribute('aria-expanded','false');render();}
$('#menu').onclick=()=>$('#menu').setAttribute('aria-expanded',String(document.body.classList.toggle('menu-open')));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>go(b.dataset.tab));
function rows(kind,day){return data.events.filter(e=>e.kind===kind&&(!day||eventDay(e)===day));}
function daily(view){
 const day=today(), meals=rows('meal_log',day),burn=rows('burn',day);
 const model=data.profile&&nutritionEstimate(data.profile);
 const targets=model?.intakeAt(data.profile.pace||0)||[];
 const show=!!model&&model.canShowIntake(targets);
 const target=(f=1)=>[...new Set(targets.map(v=>Math.round(v*f).toLocaleString()))].join('–');
 function metric(parent,title,value,hint){const m=el(parent,'div',null,'metric');el(m,'span',title);el(m,'strong',value);el(m,'small',hint);}
 const metrics=el(view,'div',null,'metrics');
 metric(metrics,'Calories eaten',meals.reduce((s,e)=>s+e.kcal,0).toLocaleString()+' kcal',meals.length+' meals logged');
 metric(metrics,'Active calories burned',burn.reduce((s,e)=>s+e.kcal,0).toLocaleString()+' kcal',burn.length+' tracked workouts');
 metric(metrics,'Daily food target',show?target()+' kcal':'—',show?'From your onboarding profile':'No numeric target set');
 const box=card(view);el(box,'h3','Daily macros');const g=el(box,'div',null,'grams');
 for(const [k,label,f] of [['protein','Protein',.25/4],['carbs','Carbs',.5/4],['fat','Fat',.25/9]]){
  const a=el(g,'div');el(a,'small',label);el(a,'p',+(meals.reduce((s,e)=>s+Number(e.macros?.[k]||0),0)).toFixed(1)+' g'+(show?' / '+target(f)+' g':''));
 }
 btn(box,'Log a meal',()=>openMeal(day)); el(box,'p','You can also text a food photo with LOG MEAL for an estimate.','muted');
}
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function plan(view,kind,day){
 const seq=rows(kind).filter(e=>local(new Date(e.at))<=day),latest=seq.at(-1), box=card(view);
 el(box,'h3',kind==='meal'?'Meal plan':'Workout plan');
 if(!latest){el(box,'p','No plan shared by this date.','muted');return;}
 const weekday=days[date(day).getDay()];
 const dailyLine=latest.body.split('\n').find(line=>line.trim().toLowerCase().startsWith(weekday.toLowerCase()+':'));
 if(dailyLine)el(box,'p',dailyLine.trim().slice(weekday.length+1).trim(),'copy');
 el(box,'small','Plan shared '+fmt(local(new Date(latest.at)),{month:'short',day:'numeric',year:'numeric'}),'date');
 if(dailyLine){const more=el(box,'details');el(more,'summary','Full weekly plan');el(more,'p',latest.body,'copy');}
 else el(box,'p',latest.body,'copy');
 const history=el(box,'details');el(history,'summary','Plan history ('+seq.length+')');
 for(const e of [...seq].reverse()){el(history,'p',fmt(local(new Date(e.at)),{month:'short',day:'numeric',year:'numeric'}),'date');el(history,'p',e.body,'copy');}
}
const labels={client_status:'Reported activity',progress:'Progress photo',meal_log:'Meal logged',workout_done:'Workout completed',burn:'Workout calories',checkin_note:'Your check-in',review:'Coach feedback',friday:'Friday check-in',meal:'Meal plan updated',workout:'Workout plan updated'};
function photo(view,eventId){
 const b=btn(view,eventId?'View progress photo':'View starting photo',async()=>{
  b.disabled=true;
  try{
   const r=await fetch(api.replace('/rest/v1/rpc/','/functions/v1/client-progress-photo'),{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({ticket:token,eventId})});
   if(!r.ok)throw Error();
   const url=URL.createObjectURL(await r.blob()),img=el(view,'img');img.alt=eventId?'Progress photo':'Starting photo';img.style.maxWidth='100%';img.onload=()=>URL.revokeObjectURL(url);img.src=url;b.hidden=true;
  }catch{b.disabled=false;b.textContent='Try loading photo again';}
 });
}
function timeline(view,events){
 if(!events.length){el(view,'p','No entries yet.','muted');return;}
 for(const e of [...events].reverse()){
  const c=card(view);el(c,'small',fmt(eventDay(e),{month:'short',day:'numeric',year:'numeric'}),'date');el(c,'h3',labels[e.kind]);el(c,'p',e.body,'copy');
  if(e.kind==='progress'&&data.adult)photo(c,e.id);
  if(e.kind==='meal_log'&&data.adult)el(c,'small',e.kcal+' kcal · '+e.macros.protein+' g protein · '+e.macros.carbs+' g carbs · '+e.macros.fat+' g fat');
 }
}
function calendar(view){
 const ctr=el(view,'div',null,'controls');
 function move(n){
  if(monthOpen){const d=date(selected);d.setDate(1);d.setMonth(d.getMonth()+n);selected=local(d);}
  else selected=shift(selected,n*7);
  render();
 }
 btn(ctr,'‹',()=>move(-1)).setAttribute('aria-label','Previous '+(monthOpen?'month':'week'));
 btn(ctr,fmt(selected,{month:'long',year:'numeric'})+(monthOpen?' ▴':' ▾'),()=>{monthOpen=!monthOpen;render()}).setAttribute('aria-expanded',String(monthOpen));
 btn(ctr,'›',()=>move(1)).setAttribute('aria-label','Next '+(monthOpen?'month':'week'));
 const grid=el(view,'div',null,monthOpen?'month':'days');
 const start=monthOpen?selected.slice(0,8)+'01':shift(selected,-date(selected).getDay());
 if(monthOpen){days.forEach(d=>el(grid,'small',d.slice(0,3)));for(let i=0;i<date(start).getDay();i++)el(grid,'span');}
 const count=monthOpen?new Date(date(start).getFullYear(),date(start).getMonth()+1,0).getDate():7;
 for(let i=0;i<count;i++){
  const s=shift(start,i),b=btn(grid,'',()=>{selected=s;render()},'daynum'+(s===selected?' selected':''));
  b.setAttribute('aria-label',fmt(s,{dateStyle:'full'}));b.setAttribute('aria-pressed',String(s===selected));
  if(!monthOpen)el(b,'small',fmt(s,{weekday:'short'}));el(b,'strong',date(s).getDate());
  if(data.events.some(e=>eventDay(e)===s))el(b,'i',null,'marker');
 }
 const bar=el(view,'div',null,'controls');el(bar,'h2',fmt(selected,{weekday:'short',month:'short',day:'numeric'}));const label=el(bar,'label','Show');const pick=el(label,'select');for(const f of ['All','Meals','Workouts'])el(pick,'option',f);pick.value=filter;pick.onchange=()=>{filter=pick.value;render()};
 if(filter!=='Workouts')plan(view,'meal',selected);if(filter!=='Meals')plan(view,'workout',selected);
 el(view,'h2','Logged that day');timeline(view,data.events.filter(e=>eventDay(e)===selected&&(filter==='Meals'?['meal_log']:filter==='Workouts'?['burn','workout_done']:['meal_log','burn','workout_done','review','checkin_note']).includes(e.kind)));
}
function render(){
 const view=$('#view');view.replaceChildren();$('#section').textContent=tab;
 for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');
 if(!data)return;
 const link=$('#message');link.hidden=!/^\+[1-9]\d{7,14}$/.test(data.phone||'');if(!link.hidden)link.href='sms:'+data.phone;
 if(tab==='Today'){el(view,'p',fmt(today(),{weekday:'long',month:'long',day:'numeric'}),'date');el(view,'h1',data.name?'Today, '+data.name:'Today');if(data.adult)daily(view);
 if(data.goal)el(view,'p','Your goal · '+data.goal,'muted');plan(view,'workout',today());plan(view,'meal',today());}
 else if(tab==='Calendar'){el(view,'h1','Calendar');calendar(view);}
 else{el(view,'h1','Progress');if(data.baseline&&data.adult)photo(card(view),null);timeline(view,data.events);}
}
const form=$('dialog form');function openMeal(day){form.reset();form.elements.day.value=day;form.elements.day.max=today();form.querySelector('p').textContent='';entry=crypto.randomUUID();$('#meal').showModal();}
$('#cancel').onclick=()=>$('#meal').close();
form.onsubmit=async ev=>{ev.preventDefault();const f=new FormData(form),body={entry,meal:f.get('meal').trim(),day:f.get('day')};
 for(const k of ['calories','protein','carbs','fat'])body[k]=Number(f.get(k));
 const save=form.querySelector('.primary');save.disabled=true;
 try{if(preview)data.events.push({kind:'meal_log',at:new Date().toISOString(),day:body.day,body:body.meal,kcal:body.calories,macros:body});
 else if(!await rpc('log_client_meal',body))throw Error();
 $('#meal').close();if(!preview)await refresh();render();
 }catch{form.querySelector('p').textContent='Couldn’t save this meal. Check the entry or text PROGRESS for a fresh link.';}finally{save.disabled=false;}
};
async function refresh(){
 if(loading)return;loading=true;
 try{
  if(!valid.test(token||''))throw Error('link');
  const d=await rpc('read_client_progress',{});if(!d)throw Error('link');
  data=d;$('#status').textContent='';render();
 }catch(err){data=null;$('#message').hidden=true;$('#meal').close();render();$('#status').textContent=err.message==='link'?'Text PROGRESS to your Coachline number for a fresh private link.':'Couldn’t load your dashboard. Check your connection and refresh.';}
 finally{loading=false;}
}
if(preview){const stamp=new Date().toISOString();data={name:'Alex',goal:'Maintain',adult:true,phone:null,profile:{age:32,sex:'Male',workouts:'3–5',weightKg:78,heightCm:180,pace:0},events:[
 {kind:'meal',at:stamp,body:'Monday: Yogurt and berries, a chicken wrap, and bean chili.\nThursday: Oatmeal, a lentil bowl, and salmon with rice.'},
 {kind:'workout',at:stamp,body:'Monday: Strength session, 30 minutes.\nThursday: Walk for 25 minutes.'},
 {kind:'meal_log',at:stamp,day:today(),body:'Breakfast wrap',kcal:410,macros:{protein:24,carbs:47,fat:14}},
 {kind:'burn',at:stamp,day:today(),body:'Active calories from a tracked workout.',kcal:240}]};$('#status').textContent='Preview · Sample client data';render();}
else{refresh();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});setInterval(()=>{if(!document.hidden&&!$('#meal').open)refresh()},60000);}
