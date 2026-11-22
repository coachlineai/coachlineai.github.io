import {publicDb} from './supabase-client.js';
import {renderProfile} from './profile-render.js?v=avatar1';
const isMatthias=location.pathname.endsWith('/matthias.html');
const slug=isMatthias?'matthias':new URLSearchParams(location.search).get('slug');
try{
 const {data,error}=await publicDb.from('published_pages').select('content').eq('slug',slug||'').maybeSingle();
 if(error)throw error;
 if(data)renderProfile(data.content,document,slug);
 else if(!isMatthias)document.querySelector('main').textContent='This creator hasn’t published a page yet.';
}catch{if(!isMatthias)document.querySelector('main').textContent='Unable to load this page. Please try again.';}
