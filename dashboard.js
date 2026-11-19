const $ = selector => document.querySelector(selector);
const navItems = {
  Home:'M3 10l9-8 9 8v11h-6v-7H9v7H3z',
  'My Store':'M4 8h16l1 13H3z M8 10V6a4 4 0 018 0v4',
  Success:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  Income:'M3 8l13-5v5 M3 8h18v13H3z M16 14h2',
  Analytics:'M3 21V9h5v12z M9 21V3h5v18z M15 21V12h5v9z',
  Customers:'M12 21C-4 11 4-2 12 7c8-9 16 4 0 14z',
  Community:'M8 9a4 4 0 108 0 4 4 0 10-8 0 M3 21c0-8 18-8 18 0z'
};
const dialog = $('dialog');
const labels = ['Store Visits','Total Revenue','Leads'];
let metric = 1;
let period = '14D';
let bars = false;
const samples = {'7D':2,'14D':3,'30D':8,MTD:5,YTD:26};
const guidance = {
 'My Store':'Preview your storefront or edit the display name.',
 'Market your products':'Share your coaching page with your audience.',
 'Add a product':'Your first coaching offer will appear in your store.',
 'Coachline AI':'Your coaching assistant will appear here.',
 Upgrade:'Creator MAX plan preview.',
 Success:'Review your recommended actions on Home.',
 Income:'Total demo revenue is $0.00.',Customers:'No customers in this demo.',Community:'Your community is empty.',
 AutoDM:'Automated messages will appear here.','Share & earn':'Referral activity will appear here.'
};
function openPanel(name) {
 $('#dialogTitle').textContent=name;
 const details=$('#details'); details.replaceChildren();
 if(name==='Home'){window.scrollTo(0,0);return}
 if(name==='Analytics'){ $('.stats').scrollIntoView({behavior:'smooth'});return }
 if(name==='Account'){const exit=document.createElement('a');exit.href='signin.html';exit.textContent='Exit demo';details.append(exit)}
 else if(name==='Edit store'){
  const input=document.createElement('input');input.value=$('#profile').textContent;input.setAttribute('aria-label','Store display name');
  const save=document.createElement('button');save.textContent='Save preview';save.onclick=()=>{if(input.value.trim())$('#profile').textContent=input.value.trim();dialog.close()};details.append(input,save)
 }else if(name==='Search'){
  const input=document.createElement('input');input.placeholder='Search menu';input.setAttribute('aria-label','Search menu');const results=document.createElement('div');
  function filter(){results.replaceChildren();for(const item of Object.keys(navItems).filter(i=>i.toLowerCase().includes(input.value.toLowerCase()))){const b=document.createElement('button');b.textContent=item;b.onclick=()=>{dialog.close();openPanel(item)};results.append(b)}}
  input.oninput=filter;filter();details.append(input,results)
 }else if(name==='Custom range'){
  const form=document.createElement('form');form.innerHTML='<label>Start date<input name="start" type="date" required></label><label>End date<input name="end" type="date" required></label><button>Apply</button>';
  form.oninput=()=>form.elements.end.min=form.elements.start.value;
  form.onsubmit=e=>{e.preventDefault();period='Custom range';samples[period]=0;render();dialog.close()};details.append(form)
 }else details.textContent=guidance[name]||'Demo preview';
 if(!dialog.open)dialog.showModal()
}
for(const [name,path] of Object.entries(navItems)){
 const b=document.createElement('button');b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="'+path+'"/></svg>';b.append(name);b.dataset.panel=name;$('nav').append(b)
}
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.panel));
$('#close').onclick=()=>dialog.close();$('#dismiss').onclick=()=>$('.banner').remove();
$('#collapse').onclick=()=>document.body.classList.toggle('compact');
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy').textContent='Demo link copied ✓'}catch{openPanel('Share & earn');$('#details').textContent=location.href}};
function render(){
 $('#ranges').replaceChildren();
 for(const name of [...Object.keys(samples).filter(n=>n!=='Custom range'),'Custom range']){
 const b=document.createElement('button');b.textContent=name;b.setAttribute('aria-pressed',name===period);b.onclick=()=>{if(name==='Custom range')openPanel(name);else{period=name;render()}};$('#ranges').append(b)}
 $('#metrics').replaceChildren();labels.forEach((name,i)=>{const b=document.createElement('button');b.setAttribute('aria-pressed',metric===i);b.innerHTML=['◎','ⓢ','♧'][i]+'　'+name+'<strong>'+[samples[period]+(period==='14D'?' <small>↗ 100%</small>':''),'$0.00','0'][i]+'</strong>';b.onclick=()=>{metric=i;render()};$('#metrics').append(b)});
 const heights=metric===0&&samples[period]>0?[0,20,12,48,30,65,82]:Array(7).fill(0);
 const shape=bars?heights.map((v,i)=>'<rect x="'+(i*15)+'" y="'+(98-v)+'" width="8" height="'+(v+1)+'"/>').join(''):'<polyline fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" points="'+heights.map((v,i)=>(i*100/6)+','+(98-v)).join(' ')+'"/>';
 $('.plot').innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="color:#685aff;fill:currentColor">'+shape+'</svg>';
 document.querySelectorAll('.chartTools button').forEach((b,i)=>{b.setAttribute('aria-pressed',Boolean(i)===bars);b.onclick=()=>{bars=Boolean(i);render()}})
}
render();
