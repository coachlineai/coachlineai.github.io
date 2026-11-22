import {db} from './supabase-client.js';
const $=s=>document.querySelector(s),form=$('.auth-form'),mode=document.body.dataset.authMode;
const status=$('.auth-status');let recovery=mode==='reset';
function message(text){status.hidden=false;status.textContent=text;}
function busy(on){form.querySelectorAll('input,button').forEach(e=>e.disabled=on);}
const callback=new URL('signin.html',location.href).href;
async function redirectSignedIn(){const {data:{session}}=await db.auth.getSession();if(session&&!recovery){const {data:{user}}=await db.auth.getUser();if(user)location.replace('dashboard.html');}}

window.addEventListener('pageshow',e=>{if(e.persisted)redirectSignedIn();});
db.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recovery=true;if(mode!=='reset')location.replace('reset-password.html');}});
form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;busy(true);try{
 const email=$('#email')?.value.trim(),password=$('#password').value;
 if(mode==='signup'){
  const full_name=$('#full-name').value.trim();if(!full_name)throw new Error('Please enter your full name.');
  const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name},emailRedirectTo:callback}});if(error)throw error;
  if(data.session)location.replace('dashboard.html');else{form.reset();message('Check your email to confirm your account. Then sign in here.');}
 }else if(mode==='reset'){
  const {error}=await db.auth.updateUser({password});if(error)throw error;
  await db.auth.signOut({scope:'global'});location.replace('signin.html?reset=success');
 }else{
  const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;location.replace('dashboard.html');
 }
}catch(e){message(e.message||'Unable to continue. Please try again.');}finally{busy(false);}};
form.querySelector('[type=submit]').disabled = false;
redirectSignedIn().catch(() => message('Unable to check your session. You can try signing in again.'));
$('#toggle-password').onclick=()=>{const p=$('#password');p.type=p.type==='password'?'text':'password';$('#toggle-password').textContent=p.type==='password'?'Show password':'Hide password';};
$('#forgot-password')?.addEventListener('click',async()=>{const email=$('#email');if(!email.reportValidity())return;try{const {error}=await db.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:new URL('reset-password.html',location.href).href});if(error)throw error;message('If an account exists for that email, you’ll receive a password reset link.');}catch(e){message(e.message);}});
if(new URLSearchParams(location.search).get('reset')==='success')message('Password updated. Sign in with your new password.');
const dialog=$('.auth-dialog');
const legal={privacy:['Privacy notice','CoachLine uses Supabase to store your account profile, authentication data, page drafts, and uploaded images. Published page content is public. Your password is handled by Supabase Auth and is never stored in your profile. GitHub Pages hosts this website.'],terms:['Creator preview','CoachLine is an early creator-page preview. Only publish images and content you have permission to use. The messaging button opens the configured phone number; publishing a page does not activate an AI messaging service or create a subscription.']};
document.querySelectorAll('[data-legal]').forEach(b=>b.onclick=()=>{const [title,text]=legal[b.dataset.legal];dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=text;dialog.showModal();});$('.auth-dialog-close').onclick=()=>dialog.close();
