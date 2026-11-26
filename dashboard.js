import {initSettings, showSettingsTab} from './settings.js?v=delete1';
import qrCode from './vendor/coach-qr.js';
import {phoneNumber} from './profile-render.js';
import {db,requireUser,accountPage,publicLink,protectRestoredPage} from './supabase-client.js';
import { initCoach } from './coach.js?v=phonepilot2';
import {initBilling} from './billing.js?v=planoffer1';
import { initIncome } from './income.js?v=payout15';
import { showClients } from './clients.js?v=registry1';
const $=s=>document.querySelector(s);let user,page,profile;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function renderMessageCard(rawPhone) {
  const card = $('#phone');
  const number = phoneNumber(rawPhone);
  if (!number) {
    const setup = node('a', 'Add your coaching number');
    setup.href = 'page-editor.html';
    card.replaceChildren(setup);
    return;
  }
  const destination = 'sms:' + number;
  const code = qrCode(0, 'M');
  code.addData(destination);
  code.make();
  const graphic = node('div', '');
  graphic.setAttribute('role', 'img');
  graphic.setAttribute('aria-label', 'Scan to message your coach');
  graphic.innerHTML = code.createSvgTag({cellSize: 6, margin: 24});
  const message = node('a', 'Message my coach');
  message.href = destination;
  message.className = 'primary';
  card.replaceChildren(graphic, message);
}
let playbook;
function routeDashboard() {
  if (!profile) return;
  const section = location.hash.split('/')[0].slice(1);
  const view = ['clients','income','coach','playbook','settings'].includes(section) ? section : 'home';
  const title = view === 'settings' ? 'Profile settings' : view === 'coach' ? 'AI Coach' : view[0].toUpperCase() + view.slice(1);
  for (const id of ['home','income','clients','coach','playbook','settings']) {
    $('#' + id + '-view').hidden = id !== view;
  }
  $('header b').textContent = title;
  document.title = title + ' | Coachline';
  $('#sidebar [aria-current]')?.removeAttribute('aria-current');
  const active = view === 'home' ? $('[data-home]') : $('#sidebar [data-open="' + title + '"]');
  active.setAttribute('aria-current','page');
  if (view === 'playbook') {
    playbook ??= import('./playbook.js?v=delete1').then(module => module.initPlaybook(db,user.id)).catch(() => {playbook=null; $('#pb-status').textContent='Could not load Playbook. Reopen it to retry.';});
  }
  if (view === 'settings') showSettingsTab(location.hash.split('/')[1]);
  if (view === 'clients') showClients(user.id);
  document.body.classList.remove('menu-open');
  $('#menu').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
  if (view === 'income') $('#income-title').focus({preventScroll:true});
}
window.addEventListener('hashchange', routeDashboard);
function show(title){if(title==='Profile settings'){location.hash='settings/profile';return;}if(['Income','Clients','AI Coach','Playbook'].includes(title)){const hash='#'+(title==='AI Coach'?'coach':title.toLowerCase());if(location.hash===hash)routeDashboard();else location.hash=hash;return;}if(title==='My Page'){location.href='page-editor.html';return;}$('#panelTitle').textContent=title;const panel=$('#panel');panel.replaceChildren();panel.append(node('p',({Analytics:'Analytics will appear once tracking is connected.',Waitlist:'Your waitlist is not connected yet.'})[title]||'This feature is not connected yet. You can edit and publish your creator page now.'));$('dialog').showModal();}
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
if(result.error)throw result.error;profile=result.data;$('h1').textContent='Welcome back, '+profile.full_name;renderMessageCard(page.draft.phone);$('#queue').textContent='No connected conversations yet.';initSettings(user,profile);const updateIncome=initIncome();initBilling(user,updateIncome);initCoach(user.id,page.draft.phone);routeDashboard();document.body.classList.remove('locked');}}catch(e){$('#notice').textContent=e.message;document.body.classList.remove('locked');document.querySelectorAll('[data-open],[data-copy]').forEach(b=>b.disabled=true);}
