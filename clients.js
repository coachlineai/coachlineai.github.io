import {liveRoster,leaveRoster} from './client-roster.js';
import { escapeHtml as e } from './profile-render.js';

const periods = ['Morning','Afternoon','Evening'];
const exercise = (name, sets, reps, done = false) => ({name, sets, reps, done});
const meal = (name, period, kcal = null) => ({name, period, kcal});
const fixtures = [
  {id:'jordan', name:'Jordan M.', digits:'4821', workout:'Leg day', reply:true, checked:true,
    message:'Can I swap lunges? I only have dumbbells.', time:'10:42 AM', burn:null,
    exercises:[exercise('Squat',4,10,true),exercise('Glute bridge',3,12,true),exercise('Reverse lunge',3,8),exercise('Calf raise',3,15)],
    meals:[meal('Oatmeal and berries','Morning',340),meal('Chicken salad','Afternoon',500),meal('Salmon and rice','Evening')]},
  {id:'taylor', name:'Taylor R.', digits:'7306', workout:'Upper body', reply:false, checked:true,
    message:'Finished my rows this morning.', time:'9:15 AM', burn:125,
    exercises:[exercise('Dumbbell row',3,10,true),exercise('Floor press',3,10),exercise('Biceps curl',3,12)],
    meals:[meal('Yogurt and granola','Morning',420),meal('Turkey wrap','Afternoon')]},
  {id:'alex', name:'Alex D.', digits:'2140', workout:'Rest day', reply:false, checked:false,
    message:'Ready for tomorrow.', time:'Yesterday', burn:null, exercises:[],
    meals:[meal('Eggs and bacon','Morning'),meal('Rice bowl','Afternoon')]}
];
let sample = false;
let currentOwner;
let clients = [];
let query = '', filter = '', sort = 'reply';
const root = () => document.querySelector('#clients-view');
const get = selector => root().querySelector(selector);
const button = (action,label) => '<button type="button" data-act="'+action+'">'+e(label)+'</button>';
const checkedMeals = c => c.meals.filter(m => m.kcal !== null);
const kcal = c => checkedMeals(c).reduce((n,m)=>n+m.kcal,0);
function progress(c) {
  const total = c.exercises.length, done = c.exercises.filter(x=>x.done).length;
  return total ? '<span class="segments" aria-hidden="true">'+c.exercises.map(x=>'<i class="'+(x.done?'filled':'')+'"></i>').join('')+'</span><small>'+done+' of '+total+' exercises logged</small>' : '<small>No workout scheduled</small>';
}
function rosterRows() {
  const rows = clients.filter(c => (c.name+' '+c.digits).toLowerCase().includes(query.trim().toLowerCase()) &&
    (!filter || (filter==='reply' ? c.reply : filter==='today' ? c.checked : !c.checked)));
  rows.sort((a,b) => (sort==='reply' && Number(b.reply)-Number(a.reply)) || (sort==='za'?-1:1)*a.name.localeCompare(b.name));
  get('#roster-results').innerHTML = rows.length ? '<div class="roster-head"><span>Client</span><span>Today’s workout</span><span>Food logged</span><span>Latest update</span></div>'+
    rows.map(c => '<a class="roster-row" href="#clients/'+c.id+'"><div class="client-name"><i>'+e(c.name[0])+'</i><div><b>'+e(c.name)+'</b><small>•• '+c.digits+'</small></div></div><div><b>'+e(c.workout)+'</b>'+progress(c)+'</div><div>'+ (checkedMeals(c).length?'~'+kcal(c)+' kcal<small>'+checkedMeals(c).length+' meals logged</small>':'No meals logged')+'</div><div>'+(c.reply?'<span class="needs">Needs reply</span> ':'')+e(c.message)+'<small>'+c.time+'</small></div></a>').join('') :
    '<p class="client-empty">'+(sample?'No clients match your search and filter.':'No clients yet. Your coaching roster will appear here when clients join.')+'</p>';
}
function roster() {
  root().innerHTML = '<div class="client-heading"><h1>Clients</h1>'+button('toggle',sample?'Exit sample clients':'Preview sample clients')+'</div>'+
    (sample?'<p class="sample-tag">Sample clients</p>':'')+
    '<div class="client-box"><div class="roster-tools"><label>Search clients<input type="search" id="roster-search" placeholder="Name or last 4 digits"></label><label>Status<select id="roster-filter"><option value="">All clients</option><option value="reply">Needs reply</option><option value="today">Checked in today</option><option value="none">No check-in yet</option></select></label><label>Sort by<select id="roster-sort"><option value="reply">Needs reply first</option><option value="az">Name A to Z</option><option value="za">Name Z to A</option></select></label></div><div id="roster-results"></div></div>';
  for (const [id,value] of [['search',query],['filter',filter],['sort',sort]]) get('#roster-'+id).value=value;
  get('#roster-search').oninput = ev=>{query=ev.target.value;rosterRows();};
  get('#roster-filter').onchange = ev=>{filter=ev.target.value;rosterRows();};
  get('#roster-sort').onchange = ev=>{sort=ev.target.value;rosterRows();};
  get('[data-act=toggle]').onclick=()=>{sample=false;clients=[];query=filter='';showClients(currentOwner);};
  rosterRows();
}
function detail(c) {
  const work = c.exercises;
  root().innerHTML = '<a href="#clients">‹ All clients</a><div class="client-heading"><h1>'+e(c.name)+'</h1><span class="sample-tag">Sample client</span></div><h2>Today</h2>'+
    '<div class="client-stats"><div>Food logged<b>'+(checkedMeals(c).length?'~'+kcal(c)+' kcal':'No meals logged')+'</b></div><div>Active calories<b>'+(c.burn===null?'No activity estimate':c.burn+' kcal · client reported')+'</b></div><div>Workout progress'+progress(c)+'</div></div>'+
    '<section class="client-box client-question">'+(c.reply?'<span class="needs">Needs reply</span>':'Latest message')+'<p>“'+e(c.message)+'”</p><small>'+c.time+'</small></section>'+
    '<section class="client-box"><div class="client-heading"><h2>'+e(c.workout)+'</h2><small>'+(work.length?(c.revised?'Coach revision · sample':'AI workout · sample sent plan'):'Recovery')+'</small></div>'+
    (work.length?'<ol class="exercise-list">'+work.map((x,i)=>'<li><div><b>'+e(x.name)+'</b><small>'+x.sets+' sets × '+x.reps+' reps</small></div>'+(x.done?'<span class="logged">Logged</span>':'<button data-ex="'+i+'">Edit exercise</button>')+'</li>').join('')+'</ol><div class="plan-actions">'+button('preview','Preview workout text')+'</div>':'<p>No exercises planned today.</p>')+
    '</section><section class="client-box"><h2>Meals</h2>'+periods.map(period=>'<div class="meal-period"><h3>'+period+'</h3>'+ (c.meals.some(m=>m.period===period)?c.meals.map((m,i)=>m.period!==period?'':'<div class="meal-row"><div>'+e(m.name)+'<small>'+(m.kcal===null?(m.revised?'Coach revision':'AI meal plan'):'Client logged · ~'+m.kcal+' kcal')+'</small></div>'+(m.kcal===null?'<button data-meal="'+i+'">Edit meal</button>':'')+'</div>').join(''):'<small>No meals yet</small>')+'</div>').join('')+'</section>';
  root().querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>editItem(c,'exercise',Number(b.dataset.ex)));
  root().querySelectorAll('[data-meal]').forEach(b=>b.onclick=()=>editItem(c,'meal',Number(b.dataset.meal)));
  const preview=get('[data-act=preview]');
  if(preview)preview.onclick=()=>{
    const text=['Hi '+c.name.split(' ')[0]+', here’s your '+c.workout.toLowerCase()+' workout.',...work.map((x,i)=>(i+1)+'. '+x.name+' · '+x.sets+' × '+x.reps+(x.done?' (logged)':''))].join('\n');
    dialog('Workout text preview','<p>Sample message · No text sent</p><p class="workout-text">'+e(text)+'</p>');
  };
}
function dialog(title, html) {
  document.querySelector('#panelTitle').textContent=title;
  document.querySelector('#panel').innerHTML=html;
  document.querySelector('#panel').closest('dialog').showModal();
}
function editItem(c, kind, index) {
  const isExercise=kind==='exercise';
  const list=isExercise?c.exercises:c.meals;
  const item=list[index];
  const options=(values,selected)=>values.map(([value,label])=>'<option value="'+e(String(value))+'" '+(value===selected?'selected':'')+'>'+e(label)+'</option>').join('');
  const fields=isExercise?'<label>Sets<input name="sets" type="number" min="1" max="100" required value="'+item.sets+'"></label><label>Reps<input name="reps" type="number" min="1" max="999" required value="'+item.reps+'"></label><label>Order among remaining exercises<select name="position">'+options(list.flatMap((x,i)=>x.done?[]:[[i,x.name]]).map(([i],n)=>[i,'Position '+(n+1)]),index)+'</select></label>':
    '<label>Move to<select name="period">'+options(periods.map(p=>[p,p]),item.period)+'</select></label>';
  dialog(isExercise?'Edit exercise':'Edit planned meal','<form id="item-editor"><label>'+ (isExercise?'Exercise name':'Meal')+'<input name="name" maxlength="100" required value="'+e(item.name)+'"></label>'+fields+'<button class="primary">Save sample changes</button></form>');
  document.querySelector('#item-editor').onsubmit=ev=>{
    ev.preventDefault();
    const f=ev.target.elements, name=f.namedItem('name').value.trim();
    if(!name){f.namedItem('name').focus();return;}
    item.name=name;
    if(isExercise){
      item.sets=Number(f.sets.value);item.reps=Number(f.reps.value);
      const slots=list.map((x,i)=>x.done?-1:i).filter(i=>i>=0);
      const pending=slots.map(i=>list[i]);
      pending.splice(slots.indexOf(index),1);
      pending.splice(slots.indexOf(Number(f.position.value)),0,item);
      slots.forEach((slot,i)=>{list[slot]=pending[i];});c.revised=true;
    } else {item.period=f.period.value;item.revised=true;}
    document.querySelector('#item-editor').closest('dialog').close();
    detail(c);
    get(isExercise?'[data-act=preview]':'[data-meal="'+index+'"]')?.focus();
  };
}
export function showClients(owner){
  if(owner!==currentOwner){sample=false;clients=[];currentOwner=owner;}
  if(!sample){liveRoster(owner,()=>{leaveRoster();sample=true;clients=structuredClone(fixtures);roster();});return;}

  const id=location.hash.split('/')[1];
  const c=clients.find(person=>person.id===id);
  if(c)detail(c);else roster();
  const heading = get('h1');
  heading.tabIndex = -1;
  heading.focus({preventScroll:true});
}

window.addEventListener('focus',()=>{
  if(currentOwner && !sample && location.hash==='#clients' && !document.querySelector('dialog[open]'))showClients(currentOwner);
});
