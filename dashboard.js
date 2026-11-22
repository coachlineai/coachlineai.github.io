import {db,requireUser,accountPage,publicLink,protectRestoredPage} from './supabase-client.js';
import { initIncome } from './income.js?v=split1';
const $=s=>document.querySelector(s);let user,page,profile;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function routeDashboard() {
  if (!profile) return;
  const income = location.hash === '#income';
  $('#home-view').hidden = income;
  $('#income-view').hidden = !income;
  $('header b').textContent = income ? 'Income' : 'Home';
  document.title = (income ? 'My Income' : 'Creator dashboard') + ' | Coachline';
  const homeButton = $('[data-home]');
  const incomeButton = $('#sidebar [data-open="Income"]');
  (income ? homeButton : incomeButton).removeAttribute('aria-current');
  (income ? incomeButton : homeButton).setAttribute('aria-current', 'page');
  document.body.classList.remove('menu-open');
  $('#menu').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
  if (income) $('#income-title').focus({preventScroll:true});
}
window.addEventListener('hashchange', routeDashboard);
function show(title){if(title==='Income'){location.hash='income';routeDashboard();return;}if(title==='My Page'){location.href='page-editor.html';return;}$('#panelTitle').textContent=title;const panel=$('#panel');panel.replaceChildren();if(title==='Profile settings'){const form=node('form',''),label=node('label','Full name'),input=node('input',''),button=node('button','Save name');input.value=profile.full_name;input.required=true;input.maxLength=80;label.append(input);form.append(label,button);form.onsubmit=async e=>{e.preventDefault();const {error}=await db.from('profiles').update({full_name:input.value.trim()}).eq('id',user.id);if(error){$('#notice').textContent=error.message;return;}profile.full_name=input.value.trim();$('h1').textContent='Welcome back, '+profile.full_name;$('dialog').close();};panel.append(form);}else panel.append(node('p',({Clients:'No client messaging service is connected yet.',Analytics:'Analytics will appear once tracking is connected.',Waitlist:'Your waitlist is not connected yet.'})[title]||'This feature is not connected yet. You can edit and publish your creator page now.'));$('dialog').showModal();}
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
if(result.error)throw result.error;profile=result.data;$('h1').textContent='Welcome back, '+profile.full_name;const phone=$('#phone');phone.replaceChildren(node('h2',page.draft.name||profile.full_name),node('p',page.draft.bio||'Make this page your own. Add your photo, links, and coaching number.'));const a=node('a','Edit my page');a.href='page-editor.html';a.className='primary';phone.append(a);$('#queue').textContent='No connected conversations yet.';initIncome();routeDashboard();document.body.classList.remove('locked');}}catch(e){$('#notice').textContent=e.message;document.body.classList.remove('locked');document.querySelectorAll('[data-open],[data-copy]').forEach(b=>b.disabled=true);}
