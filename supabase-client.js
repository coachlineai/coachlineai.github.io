import { createClient } from './vendor/supabase.js';
export const SUPABASE_URL='https://kvpngwwaemdjwchslcov.supabase.co';
export const PUBLISHABLE_KEY='sb_publishable_Ls2Da1rHiPIT8VR-9RbSGw_FkS_ofgL';
export const db=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export const publicDb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{storageKey:'coachline-public',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
export async function requireUser(){
 const {data:{session}}=await db.auth.getSession();
 if(!session){location.replace('signin.html');return null;}
 const {data,error}=await db.auth.getUser();
 if(error||!data.user){
  if(error?.status>=500||error?.name==='AuthRetryableFetchError')throw new Error('Unable to verify your account. Check your connection and reload.');
  await db.auth.signOut({scope:'local'});location.replace('signin.html');return null;
 }
 return data.user;
}
export async function accountPage(){const {data,error}=await db.from('creator_pages').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;if(!data)throw new Error('Your page is not ready yet. Please sign out and sign back in.');return data;}
export function publicLink(page){return new URL(page.slug==='matthias'?'matthias.html':'creator.html?slug='+encodeURIComponent(page.slug),location.href).href;}
export function protectRestoredPage(){
 window.addEventListener('pagehide',()=>{document.body.style.visibility='hidden'});
 window.addEventListener('pageshow',async e=>{if(e.persisted){try{if(await requireUser())document.body.style.visibility='visible'}catch{location.reload()}}});
 db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){document.body.replaceChildren();location.replace('signin.html')}});
}
