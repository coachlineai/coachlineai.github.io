import {db,requireUser,accountPage,publicLink,protectRestoredPage} from './supabase-client.js';
import {renderProfile,platforms,validatePage,phoneNumber} from './profile-render.js?v=pageowner1';
const $=s=>document.querySelector(s);let page,draft,dirty=false,busy=false,uploading=0,revision=0;
const fields=['name','handle','bio','position'];
const status=text=>$('#status').textContent=text;
function fail(e){$('#error').textContent=e.message||'Something went wrong. Please try again.';}
function controls(){ $('#save').disabled=!page||busy||uploading>0||!dirty;$('#publish').disabled=!page||busy||uploading>0;$('#fields').disabled=!page||busy; }
function changed(){dirty=true;revision++;status('Unpublished changes');controls();preview();}
function collect(){for(const f of fields)draft[f]=$( '#'+f).value;draft.buttonLabel=$('#button-label').value;draft.phone=$('#phone').value;}
const previewFrame = $('#preview');
let previewReady = false;
let pendingFrame = 0;

function preview() {
  if (!previewReady || !draft || pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    renderProfile(draft, previewFrame.contentDocument,page.slug);
  });
}

previewFrame.addEventListener('load', () => {
  const doc = previewFrame.contentDocument;
  if (!doc.querySelector('link[rel="stylesheet"]')) return;
  previewReady = true;
  doc.addEventListener('click', event => event.preventDefault());
  preview();
});
previewFrame.srcdoc = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="profile.css?v=avatar1"></head><body></body></html>';

function field(label,value,type='text'){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type=type;input.value=value||'';input.maxLength=type==='url'?1000:60;wrap.append(input);return [wrap,input];}
function socialRows(){const host=$('#social-links');host.replaceChildren();draft.socials.forEach((s,index)=>{const row=document.createElement('div');row.className='social-row';const label=document.createElement('label');label.textContent='Platform';const select=document.createElement('select');for(const p of platforms){const o=document.createElement('option');o.textContent=p;select.append(o);}select.value=s.platform;label.append(select);row.append(label);select.onchange=()=>{s.platform=select.value;s.label=select.value;socialRows();changed();};for(const [title,key,type] of [['Label','label','text'],['Link','url','url']]){const [wrap,input]=field(title,s[key],type);input.oninput=()=>{s[key]=input.value;changed();};row.append(wrap);}if(s.platform==='Custom'){const [wrap,input]=field('Upload logo','','file');input.accept='image/png,image/jpeg,image/webp';input.onchange=()=>upload(input.files[0],path=>{s.logoPath=path;delete s.logo;});row.append(wrap);}const actions=document.createElement('div');actions.className='row-actions';for(const [text,move] of [['Up',-1],['Down',1]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=index+move<0||index+move>=draft.socials.length;b.onclick=()=>{[draft.socials[index],draft.socials[index+move]]=[draft.socials[index+move],draft.socials[index]];socialRows();changed();};actions.append(b);}const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.onclick=()=>{draft.socials.splice(index,1);socialRows();changed();};actions.append(remove);row.append(actions);host.append(row);});$('#add-social').disabled=draft.socials.length>=12;}
async function resolved(content){const p=structuredClone(content);if(p.imagePath){const {data,error}=await db.storage.from('page-drafts').createSignedUrl(p.imagePath,3600);if(error)throw error;p.image=data.signedUrl;}for(const s of p.socials||[]){if(s.logoPath){const {data,error}=await db.storage.from('page-drafts').createSignedUrl(s.logoPath,3600);if(error)throw error;s.logo=data.signedUrl;}}return p;}
async function previewImages(){const p=await resolved(draft);draft.image=p.image;draft.socials.forEach((s,i)=>{if(p.socials[i]?.logo)s.logo=p.socials[i].logo;});preview();}
async function upload(file,assign){if(!file)return;uploading++;controls();$('#error').textContent='';try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose a JPG, PNG or WebP under 5 MB.');const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',.84));if(!blob)throw new Error('Unable to read this image. Try another photo.');const path=page.id+'/'+crypto.randomUUID()+'.webp';const {error}=await db.storage.from('page-drafts').upload(path,blob,{contentType:'image/webp',upsert:false});if(error)throw error;assign(path);await previewImages();changed();}catch(e){fail(e);}finally{uploading--;controls();}}
function storedDraft(){const p=structuredClone(draft);if(p.imagePath)delete p.image;for(const s of p.socials){if(s.logoPath)delete s.logo;}return p;}
async function save(){collect();const current=revision;const {data,error}=await db.rpc('save_page',{p_id:page.id,p_version:page.version,p_content:storedDraft()});if(error)throw error;page=data;if(revision===current)dirty=false;status(dirty?'Unpublished changes':'Draft saved · Not published');}
async function publicContent(){const p=structuredClone(draft);p.phone=phoneNumber(p.phone);async function promote(path){const {data,error}=await db.storage.from('page-drafts').download(path);if(error)throw error;const dest=page.id+'/'+crypto.randomUUID()+'.webp';const result=await db.storage.from('page-public').upload(dest,data,{contentType:'image/webp',upsert:false});if(result.error)throw result.error;return db.storage.from('page-public').getPublicUrl(dest).data.publicUrl;}
 if(p.imagePath){p.image=await promote(p.imagePath);delete p.imagePath;}
 for(const s of p.socials){if(s.logoPath){s.logo=await promote(s.logoPath);delete s.logoPath;}}
 return p;
}
$('#editor-form').onsubmit=e=>e.preventDefault();
$('#editor-form').addEventListener('input',e=>{if(e.target.type==='file'||e.target.closest('.social-row'))return;collect();changed();});
function visualControls(){
 const assigned=page.slug==='matthias';
 const avatar=assigned && draft.visual==='avatar';
 $('#avatar-options').hidden=!assigned;
 $('#photo-position').hidden=avatar;
 $('#use-avatar').setAttribute('aria-pressed',avatar);
 $('#use-photo').setAttribute('aria-pressed',!avatar);
}
for(const [id,visual] of [['use-avatar','avatar'],['use-photo','photo']]){
 $('#'+id).onclick=()=>{draft.visual=visual;visualControls();changed();};
}
$('#photo').onchange=e=>upload(e.target.files[0],path=>{draft.imagePath=path;delete draft.image;draft.visual='photo';visualControls();});
$('#add-social').onclick=()=>{if(draft.socials.length>=12)return;draft.socials.push({platform:'Instagram',label:'Instagram',url:''});socialRows();changed();};
$('#save').onclick=async()=>{busy=true;controls();try{await save();$('#error').textContent='';}catch(e){fail(e);}finally{busy=false;controls();}};
$('#publish').onclick=()=>{try{collect();validatePage(draft,{allowUnassigned:true});$('#publish-dialog').showModal();}catch(e){fail(e);}};
$('#cancel-publish').onclick=()=>$('#publish-dialog').close();
$('#confirm-publish').onclick=async()=>{$('#publish-dialog').close();busy=true;controls();try{collect();validatePage(draft,{allowUnassigned:true});await save();status('Publishing…');const content=await publicContent();const {error}=await db.rpc('publish_page',{p_id:page.id,p_version:page.version,p_content:content});if(error)throw error;status('Published · Your page is live');$('#error').textContent='';}catch(e){fail(e);status('Publish failed · Review the error before retrying');}finally{busy=false;controls();}};
for(const mode of ['desktop','mobile'])$('#'+mode).onclick=()=>{$('#preview').classList.toggle('mobile',mode==='mobile');$('#desktop').setAttribute('aria-pressed',mode==='desktop');$('#mobile').setAttribute('aria-pressed',mode==='mobile');};
window.addEventListener('beforeunload',e=>{if(dirty||uploading){e.preventDefault();e.returnValue='';}});
try{const user=await requireUser();if(user){protectRestoredPage();page=await accountPage();draft={name:'',handle:'',bio:'',position:0,buttonLabel:'Message my AI coach',phone:'',socials:[],...page.draft};const line=await db.rpc('editor_ai_line',{page:page.id});if(line.error)throw line.error;draft.phone=line.data||'';for(const f of fields)$('#'+f).value=draft[f];$('#button-label').value=draft.buttonLabel;$('#phone').value=draft.phone;$('#view-live').href=publicLink(page);visualControls();socialRows();await previewImages();status('Draft loaded');controls();}}catch(e){fail(e);status('Unable to load page');}
