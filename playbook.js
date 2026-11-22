const $ = id => document.getElementById(id);
const pad = value => String(value).padStart(2,'0');
function dayKey(d) {return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');}
function localTime(d) {return dayKey(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}
function offset(date, days) {const d=new Date(date); d.setDate(d.getDate()+days); return d;}
function monday(d) {return offset(d,-((d.getDay()+6)%7));}
function format(d, options) {return d.toLocaleDateString(undefined,options);}
function element(tag,text,cls) {
  const el=document.createElement(tag);
  if(text) el.textContent=text;
  if(cls) el.className=cls;
  return el;
}
export async function initPlaybook(db, owner) {
  const store=db.storage.from('playbook-media'), table=()=>db.from('playbook_items');
  const board=$('pb-board'), dialog=$('pb-editor'), form=$('pb-form'), fields=form.elements;
  let formChanged=false;
  let items=[], view='week', anchor=new Date(), editing=null, shareUrl='', busy=false;
  const media=new Map();
  async function mediaUrl(item) {
    if(item.kind==='Link') return item.asset;
    const cached=media.get(item.asset);
    if(cached && cached.until>Date.now()) return cached.url;
    const {data,error}=await store.createSignedUrl(item.asset,3600);
    if(error) throw error;
    media.set(item.asset,{url:data.signedUrl,until:Date.now()+3500000});
    return data.signedUrl;
  }
  function card(item) {
    const button=element('button','','pb-item');
    button.type='button';
    button.dataset.topic=item.topic;
    if(view!=='month' && item.kind!=='Link') {
      const thumb=element(item.kind==='Photo'?'img':'video');
      if(item.kind==='Photo')thumb.alt='';
      else {thumb.muted=true;thumb.playsInline=true;thumb.preload='metadata';}
      button.append(thumb);
      mediaUrl(item).then(url=>thumb.src=url).catch(()=>thumb.remove());
    }
    button.append(element('small',item.topic),element('strong',item.title));
    const time=item.scheduled_at ? new Date(item.scheduled_at) : null;
    const stamp=time ? (view==='library' ? format(time,{month:'short',day:'numeric'})+' · ' : '') + time.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : 'Draft';
    button.append(element('span',item.kind+' · '+stamp));
    button.draggable=true;
    button.ondragstart=e=>e.dataTransfer.setData('application/x-coachline-item',item.id);
    button.onclick=()=>open(item);
    return button;
  }
  function render() {
    const today=dayKey(new Date()), month=view==='month';
    board.replaceChildren(); board.className='pb-'+view;
    $('pb-nav').hidden=view==='library';
    document.querySelectorAll('[data-pb-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.pbView===view));
    const filtered=items.filter(i=>$('pb-filter').value==='All topics'||i.topic===$('pb-filter').value);
    if(view==='library') {
      $('pb-period').textContent='Content library';
      if(!filtered.length) board.append(element('p','No content here yet. Add a photo, video, or link to get started.','pb-empty'));
      filtered.forEach(i=>board.append(card(i)));return;
    }
    const first=new Date(anchor.getFullYear(),anchor.getMonth(),1);
    const start=monday(month?first:anchor);
    const days=month ? Math.ceil((((first.getDay()+6)%7)+new Date(anchor.getFullYear(),anchor.getMonth()+1,0).getDate())/7)*7 : 7;
    $('pb-period').textContent=month ? format(anchor,{month:'long',year:'numeric'}) : format(start,{month:'short',day:'numeric'})+' – '+format(offset(start,6),{month:'short',day:'numeric',year:'numeric'});
    for(let i=0;i<days;i++) {
      const date=offset(start,i), key=dayKey(date);
      const day=element('div','','pb-day');
      if(key===today) day.classList.add('pb-current');
      if(month&&date.getMonth()!==anchor.getMonth()) day.classList.add('pb-outside');
      const add=element('button','','pb-date');
      add.append(element('span',format(date,{weekday:'short'})),element('strong',String(date.getDate())),element('i','+'));
      add.setAttribute('aria-label','Add content for '+date.toDateString());add.onclick=()=>open(null,date);
      day.ondragover=e=>{
        if(e.dataTransfer.types.includes('application/x-coachline-item'))e.preventDefault();
      };
      day.ondrop=e=>{
        e.preventDefault();
        const item=items.find(i=>i.id===e.dataTransfer.getData('application/x-coachline-item'));
        if(!item)return;
        open(item);
        fields.when.value=key+fields.when.value.slice(10);
        fields.timing.value='later';timing();$('pb-share').hidden=true;
      };
      day.append(add);
      filtered.filter(item=>item.scheduled_at && dayKey(new Date(item.scheduled_at))===key)
        .sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at)).forEach(item=>day.append(card(item)));
      board.append(day);
    }
  }
  function timing() {
    const later=fields.timing.value==='later';
    $('pb-when').hidden=!later;fields.when.required=later;
    $('pb-help').textContent=fields.timing.value==='draft'?'Available in your library until you choose a date.':later?'Saved in your local time zone. Client delivery is manual.':'Save to today’s calendar, then share with clients.';
    $('pb-submit').textContent=fields.timing.value==='draft'?'Save draft':later?'Save schedule':'Save for today';
  }
  function kind() {
    const link=fields.kind.value==='Link';
    $('pb-upload').hidden=link||!!editing;$('pb-link').hidden=!link;
    fields.url.required=link;fields.file.required=!link&&!editing;
    fields.file.accept=fields.kind.value==='Photo'?'image/jpeg,image/png,image/webp':'video/mp4,video/quicktime,video/webm';
  }
  function open(item,date=new Date()) {
    editing=item;shareUrl='';formChanged=false;form.reset();$('pb-error').textContent='';$('pb-media').replaceChildren();
    $('pb-editor-title').textContent=item?'Content details':'Add content';
    fields.title.value=item?.title||'';fields.caption.value=item?.caption||'';
    fields.kind.value=item?.kind||'Photo';fields.kind.disabled=!!item;
    fields.topic.value=item?.topic||'Workout';fields.url.value=item?.kind==='Link'?item.asset:'';
    const d=item?.scheduled_at?new Date(item.scheduled_at):new Date(date);
    if(!item?.scheduled_at) d.setHours(9,0,0,0);
    fields.when.value=localTime(d);
    fields.timing.value=item&&!item.scheduled_at?'draft':'later';
    $('pb-share').hidden=true;
    if(item) {
      mediaUrl(item).then(url=>{
        if(editing!==item || !dialog.open)return;
        if(item.kind!=='Link') {
          const el=element(item.kind==='Photo'?'img':'video');el.src=url;
          if(item.kind==='Video'){el.controls=true;el.preload='metadata';}else el.alt=item.title;
          $('pb-media').append(el);
        }
        if(!formChanged && item.scheduled_at && new Date(item.scheduled_at)<=new Date()) {
          shareUrl=url;$('pb-share').hidden=false;
        }
      }).catch(()=>{$('pb-error').textContent='Unable to load this attachment. Reopen to retry.';});
    }
    kind();timing();if(!dialog.open)dialog.showModal();
  }
  fields.kind.onchange=kind;fields.timing.onchange=timing;
  form.oninput=()=>{formChanged=true;$('pb-share').hidden=true;};
  $('pb-close').onclick=()=>dialog.close();
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{$('pb-media').replaceChildren();editing=null;});
  $('pb-add').onclick=()=>open(null);
  $('pb-share').onclick=async()=>{
    if(!editing||!shareUrl)return;
    const message=[editing.caption||editing.title,shareUrl].join('\n');
    try {
      if(navigator.share) await navigator.share({text:message});
      else {await navigator.clipboard.writeText(message);$('pb-help').textContent='Copied. Paste into your client conversation.';}
    } catch(e){if(e.name!=='AbortError')$('pb-error').textContent='Sharing unavailable on this device.';}
  };
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    $('pb-error').textContent='';
    const title=fields.title.value.trim(), kindValue=fields.kind.value, when=fields.timing.value;
    const date=when==='now'?new Date():when==='later'?new Date(fields.when.value):null;
    if(!title){fields.title.focus();return;}
    const sameTime=editing?.scheduled_at && fields.when.value===localTime(new Date(editing.scheduled_at));
    if(when==='later' && (!Number.isFinite(+date)||(+date<Date.now() && !sameTime))) {
      $('pb-error').textContent='Choose a future time or select Share today.';return;
    }
    const original=editing, row={title,kind:kindValue,topic:fields.topic.value,caption:fields.caption.value.trim(),scheduled_at:date?.toISOString()||null};
    let uploaded='';
    busy=true;form.inert=true;
    try {
      if(kindValue==='Link') {
        const url=new URL(fields.url.value);
        if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a complete HTTPS link.');
        row.asset=url.href;
      }else if(original) row.asset=original.asset;
      else {
        const file=fields.file.files[0];
        if(!file || !fields.file.accept.split(',').includes(file.type)||file.size>25*1024*1024||file.size===0)throw Error('Choose a supported file up to 25 MB.');
        const path=owner+'/'+crypto.randomUUID();
        const {error}=await store.upload(path,file,{contentType:file.type});
        if(error)throw error; uploaded=row.asset=path;
      }
      const request=original?table().update(row).eq('id',original.id):table().insert(row);
      const {data,error}=await request.select().single();
      if(error){if(uploaded && error.code)await store.remove([uploaded]);throw error;}
      items=[data,...items.filter(i=>i.id!==data.id)];
      if(date){anchor=date;if(view==='library'||when==='now')view='week';}else view='library';
      $('pb-filter').value='All topics';render();
      $('pb-status').textContent=date?'Saved to your calendar.':'Saved to your library.';
      if(when==='now'){open(data);$('pb-help').textContent=kindValue==='Link'?'Share this link with clients.':'Share this private media link with clients. The link is valid for up to one hour.';}else dialog.close();
    }catch(err){$('pb-error').textContent=err.message||'Could not save. Please retry.';}
    finally{busy=false;form.inert=false;}
  };
  for(const b of document.querySelectorAll('[data-pb-view]'))b.onclick=()=>{view=b.dataset.pbView;render();};
  function move(step){anchor=view==='month'?new Date(anchor.getFullYear(),anchor.getMonth()+step,1):offset(anchor,step*7);render();}
  $('pb-prev').onclick=()=>move(-1);$('pb-next').onclick=()=>move(1);$('pb-today').onclick=()=>{anchor=new Date();render();};
  $('pb-filter').onchange=render;
  $('pb-add').disabled=true;
  $('pb-status').textContent='Loading content…';
  const {data,error}=await table().select('*').eq('owner_id',owner).order('created_at',{ascending:false});
  if(error) {
    $('pb-status').textContent='Could not load your calendar. Refresh the dashboard to retry.';
    return;
  }
  items=data;$('pb-add').disabled=false;$('pb-status').textContent='';render();
}
