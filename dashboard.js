const $ = selector => document.querySelector(selector);
const panel = $('#panel');
const modal = $('dialog');
const phone = $('#phone');
const questions = [
  ['Jordan', 'Could you look at my squat video?'],
  ['Alex', 'Can we move my weekly check-in to Friday?']
];
const defaults = {
  title:'Train with Matthias', bio:'Workout support, meal check-ins, and weekly accountability.',
  instructions:'Keep replies encouraging and ask about the client’s last session.',
  keyword:'COACH', reply:'Here’s the link to join my coaching pilot!', replies:{}, invites:0
};
let state = {...defaults};
try {Object.assign(state, JSON.parse(sessionStorage.getItem('coachingPilot') || '{}'))} catch {}
function save(){try {sessionStorage.setItem('coachingPilot',JSON.stringify(state))} catch {}}
function node(tag,text){const el=document.createElement(tag);el.textContent=text;return el}
function action(text,fn,style='soft'){const b=node('button',text);b.type='button';b.className=style;b.onclick=fn;return b}
function field(form,label,value,multiline=false){
  const wrap=node('label',label),input=document.createElement(multiline?'textarea':'input');
  input.required=true;input.value=value;wrap.append(input);form.append(wrap);return input
}
function link(kind){if(kind==='coaching')return new URL('matthias.html',location.href).href;const url=new URL('dashboard.html',location.href);url.searchParams.set('view',kind);return url.href}
async function copy(kind){
 const url=link(kind);
 try{await navigator.clipboard.writeText(url);$('#notice').textContent='Demo link copied';setTimeout(()=>$('#notice').textContent='',2200)}
 catch{show('Copy link');const input=node('input','');input.value=url;input.readOnly=true;panel.append(input);input.select()}
}
function renderQueue(){
 const queue=$('#queue');queue.replaceChildren();
 questions.forEach(([name,question])=>{
  if(state.replies[name])return;
  const row=node('div','');row.className='row';const info=node('div','');
  info.append(node('b',name),node('p',question));row.append(info,action('Open conversation',()=>show(name)));queue.append(row)
 });
 if(!queue.children.length)queue.textContent='You’re caught up.';
 $('#waiting').textContent=12-state.invites
}
function renderPhone(coach=false){
 phone.replaceChildren();$('#pageTab').setAttribute('aria-pressed',!coach);$('#coachTab').setAttribute('aria-pressed',coach);
 if(!coach){
  const img=document.createElement('img');img.src='assets/coach.webp';img.alt='';
  phone.append(img,node('h2',state.title),node('p',state.bio),node('b','$3.99 / week'),action('Join coaching',()=>show('Join coaching'),'primary'));return
 }
 phone.append(node('h2','Try my coach'),node('small','Scripted demo'));
 const form=node('form','');const prompt=field(form,'Client question','');
 const answer=node('p','');answer.setAttribute('aria-live','polite');
 form.append(node('button','Send'));form.onsubmit=e=>{e.preventDefault();answer.textContent=/meal|food|photo/i.test(prompt.value)?'What did you have for this meal, and how did you feel afterward?':'Tell me about your last session and what you’d like to work on next.'};
 phone.append(form,answer)
}
function editor(title,fields,onSave){
 const form=node('form','');const inputs=fields.map(([label,value,multi])=>field(form,label,value,multi));
 const submit=node('button',title);submit.className='primary';form.append(submit);
 form.onsubmit=e=>{e.preventDefault();onSave(inputs.map(i=>i.value.trim()));save();modal.close()};panel.append(form)
}
function show(name){
 if(name==='My Page'){location.href='matthias.html';return}
 document.body.classList.remove('menu-open');$('#menu').setAttribute('aria-expanded','false');
 $('#panelTitle').textContent=name;panel.replaceChildren();
 const p=text=>panel.append(node('p',text));
 if(name==='My Page')editor('Save page',[['Page title',state.title],['Coaching offer',state.bio,true]],([title,bio])=>{Object.assign(state,{title,bio});renderPhone()});
 else if(name==='AI Coach'){
  p('Save coaching instructions for this demo. Preview replies are scripted.');
  panel.append(action('Try a client question',()=>{modal.close();renderPhone(true);phone.scrollIntoView({block:'center'});phone.querySelector('input').focus()}));
  editor('Save instructions',[['Coaching instructions',state.instructions,true]],([v])=>state.instructions=v)
 }else if(name==='Auto DMs'){
  p('Preview a keyword reply for Instagram.');editor('Save demo rule',[['Comment keyword',state.keyword],['Reply',state.reply,true]],([keyword,reply])=>Object.assign(state,{keyword,reply}))
 }else if(name==='Clients'||name==='Waitlist'){
  p('8 paying clients · '+(12-state.invites)+' waiting · '+state.invites+' invited');
  for(const [person] of questions)panel.append(action(person,()=>show(person)));
  if(state.invites<12)panel.append(action('Invite next client (demo)',()=>{state.invites++;save();renderQueue();show(name)}));
 }else if(questions.some(q=>q[0]===name)){
  p(questions.find(q=>q[0]===name)[1]);if(state.replies[name])p('Your reply: '+state.replies[name]);
  editor('Save demo reply',[['Your reply','',true]],([v])=>{state.replies[name]=v;renderQueue()})
 }else if(name==='Income'){
  p('Lifetime coaching earnings: $51.07');p('This week: $31.92 gross × 80% creator share = $25.54.');p('Referral commissions: $0.00');p('Paid out: $25.53 · Awaiting payout: $25.54');p('Sample figures for the pilot.')
 }else if(name==='Analytics'){
  p('This week · Sample activity');for(const line of ['Page visits · 64','Paid signups · 8','Clients who checked in · 6','Renewals · 0'])p(line)
 }else if(name==='Refer a creator'){p('0 referred creators · $0.00 commission');panel.append(action('Copy creator referral link',()=>copy('referral')))}
 else if(name==='Profile settings'){p('Matthias McKinnon · Demo creator');panel.append(action('Edit public page',()=>show('My Page')))}
 else if(name==='Join coaching'){p('You’ve reached the end of the coaching signup preview. No payment is collected.')}
 if(!modal.open)modal.showModal()
}
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>show(b.dataset.open));
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(b.dataset.copy));
$('#menu').onclick=()=>$('#menu').setAttribute('aria-expanded',document.body.classList.toggle('menu-open'));
$('[data-home]').onclick=()=>{document.body.classList.remove('menu-open');$('#menu').setAttribute('aria-expanded','false');window.scrollTo(0,0)};
$('#close').onclick=()=>modal.close();$('#pageTab').onclick=()=>{location.href='matthias.html'};$('#coachTab').onclick=()=>renderPhone(true);
renderPhone();renderQueue();
const view=new URLSearchParams(location.search).get('view');
if(['referral','coaching'].includes(view)){
 document.body.classList.add('public');document.body.append(phone);
 if(view==='referral'){phone.replaceChildren(node('h2','Coach with Coachline'),node('p','Matthias invited you to preview the creator experience.'));const a=node('a','Explore creator signup');a.href='signup.html';phone.append(a)}
}
