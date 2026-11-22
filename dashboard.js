import {db,requireUser,accountPage,publicLink,protectRestoredPage} from './supabase-client.js';
import { initCoach } from './coach.js?v=coach-phone1';
import { initIncome } from './income.js?v=info1';
import { showClients } from './clients.js';
const $=s=>document.querySelector(s);let user,page,profile;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
let playbook;
function routeDashboard() {
  if (!profile) return;
  const section = location.hash.split('/')[0].slice(1);
  const view = ['clients','income','coach','playbook'].includes(section) ? section : 'home';
  const title = view === 'coach' ? 'AI Coach' : view[0].toUpperCase() + view.slice(1);
  for (const id of ['home','income','clients','coach','playbook']) {
    $('#' + id + '-view').hidden = id !== view;
  }
  $('header b').textContent = title;
  document.title = title + ' | Coachline';
  $('#sidebar [aria-current]')?.removeAttribute('aria-current');
  const active = view === 'home' ? $('[data-home]') : $('#sidebar [data-open="' + title + '"]');
  active.setAttribute('aria-current','page');
  if (view === 'playbook') {
    playbook ??= import('./playbook.js?v=guidance1').then(module => module.initPlaybook(db,user.id)).catch(() => {playbook=null; $('#pb-status').textContent='Could not load Playbook. Reopen it to retry.';});
  }
  if (view === 'clients') showClients();
  document.body.classList.remove('menu-open');
  $('#menu').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
  if (view === 'income') $('#income-title').focus({preventScroll:true});
}
window.addEventListener('hashchange', routeDashboard);
function show(title){if(['Income','Clients','AI Coach','Playbook'].includes(title)){const hash='#'+(title==='AI Coach'?'coach':title.toLowerCase());if(location.hash===hash)routeDashboard();else location.hash=hash;return;}if(title==='My Page'){location.href='page-editor.html';return;}$('#panelTitle').textContent=title;const panel=$('#panel');panel.replaceChildren();if(title==='Profile settings'){const form=node('form',''),label=node('label','Full name'),input=node('input',''),button=node('button','Save name');input.value=profile.full_name;input.required=true;input.maxLength=80;label.append(input);form.append(label,button);form.onsubmit=async e=>{e.preventDefault();const {error}=await db.from('profiles').update({full_name:input.value.trim()}).eq('id',user.id);if(error){$('#notice').textContent=error.message;return;}profile.full_name=input.value.trim();$('h1').textContent='Welcome back, '+profile.full_name;$('dialog').close();};panel.append(form);}else panel.append(node('p',({Analytics:'Analytics will appear once tracking is connected.',Waitlist:'Your waitlist is not connected yet.'})[title]||'This feature is not connected yet. You can edit and publish your creator page now.'));$('dialog').showModal();}
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>show(b.dataset.open));
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(publicLink(page));$('#notice').textContent='Page link copied. Publish your page before sharing it.';}catch{$('#notice').textContent=publicLink(page);}});
$('#menu').onclick=()=>$('#menu').setAttribute('aria-expanded',document.body.classList.toggle('menu-open'));
$('[data-home]').onclick=()=>{location.hash='home';routeDashboard();};
$('#close').onclick=()=>$('dialog').close();$('#pageTab').onclick=()=>show('My Page');$('#coachTab').onclick=()=>show('AI Coach');
$('#logout').onclick=async()=>{const {error}=await db.auth.signOut({scope:'local'});if(error){$('#notice').textContent=error.message;return;}location.replace('signin.html');};
try{user=await requireUser();if(user){protectRestoredPage();const [ownedPage, result] = await Promise.all([
  accountPage(),
  db.from('profiles').select('full_name').eq('id', user.id).single()
]);
page = ownedPage;
if(result.error)throw result.error;profile=result.data;$('h1').textContent='Welcome back, '+profile.full_name;const phone=$('#phone');phone.replaceChildren(node('h2',page.draft.name||profile.full_name),node('p',page.draft.bio||'Make this page your own. Add your photo, links, and coaching number.'));const a=node('a','Edit my page');a.href='page-editor.html';a.className='primary';phone.append(a);$('#queue').textContent='No connected conversations yet.';initIncome();initCoach(user.id,page.draft.phone);routeDashboard();document.body.classList.remove('locked');}}catch(e){$('#notice').textContent=e.message;document.body.classList.remove('locked');document.querySelectorAll('[data-open],[data-copy]').forEach(b=>b.disabled=true);}
