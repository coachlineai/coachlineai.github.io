import {openCoachingFeed} from './coaching-feed.js';
import {db,SUPABASE_URL,PUBLISHABLE_KEY} from './supabase-client.js';
import {escapeHtml as e} from './profile-render.js';

const labels={once:'Lifetime',week:'Weekly',year:'Annual'};
const price=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
let generation=0;
let timer,removeMark;
let query='',status='',sort='recent';
const label=text=>e(String(text??''));
export function leaveRoster(){generation++;clearInterval(timer);removeMark?.();}
export async function liveRoster(owner,preview){
  leaveRoster();
  const run=generation;
  const root=document.querySelector('#clients-view');
  root.innerHTML='<div class="client-heading"><h1 tabindex="-1">Clients</h1><button data-sample>Preview sample clients</button></div><div class="client-box"><div class="roster-tools"><label>Search clients<input type="search" placeholder="Name or last 4 digits"></label><label>Payment status<select data-filter><option value="">All clients</option><option>Sandbox payment</option><option>Paid</option><option>Awaiting payment</option><option>Ended</option></select></label><label>Sort by<select data-sort><option value="recent">Recently joined</option><option value="az">Name A to Z</option><option value="za">Name Z to A</option></select></label></div><div data-results aria-live="polite">Loading clients…</div></div>';
  root.querySelector('[data-sample]').onclick=preview;
  const out=root.querySelector('[data-results]');
  const search=root.querySelector('input'),filter=root.querySelector('[data-filter]'),ordering=root.querySelector('[data-sort]');
  search.value=query;filter.value=status;ordering.value=sort;
  const rows=[];
  const unread=new Set();
  function render(){
    const matches=rows.filter(c=>(!status||c.payment===status) && (c.name+' '+c.digits).toLowerCase().includes(query.trim().toLowerCase()));
    if(sort!=='recent')matches.sort((a,b)=>(sort==='az'?1:-1)*String(a.name).localeCompare(String(b.name)));
    if(!matches.length){out.innerHTML='<p class="client-empty">'+(rows.length?'No clients match your filters.':'Completed client profiles will appear here.')+'</p>';return;}
    out.innerHTML='<div class="client-table-scroll"><table class="registered-clients"><thead><tr>'+['Client','Mission and goal','Last reported activity','Payment','Before photo','Onboarding summary'].map(t=>'<th scope="col">'+t+'</th>').join('')+'</tr></thead><tbody>'+matches.map(c=>'<tr><th scope="row"><button data-feed="'+label(c.id)+'">'+label(c.name||'Client')+'</button>'+(unread.has(c.id)?'<span class="client-unread">New</span>':'')+'<small>•• '+label(c.digits)+' · Joined '+label(new Date(c.joined_at).toLocaleDateString())+'</small></th><td>'+label(c.mission||'—')+'<small>'+label(c.goal)+'</small></td><td>'+label(c.report?.status||'—')+(c.report?'<small>'+label(new Date(c.report.reported_at).toLocaleString())+'</small>':'')+'</td><td>'+label(c.payment)+(c.plan?'<small>'+label(labels[c.plan])+' · '+label(price.format(c.amount/100))+'</small>':'')+'</td><td>'+(c.photo==='Received'?'<button data-photo="'+label(c.id)+'">View photo</button>':label(c.photo))+'</td><td><button data-pdf="'+label(c.id)+'">Open PDF</button></td></tr>').join('')+'</tbody></table></div>';
  }
  async function fetchRows(){
    const next=[];
    for(let start=0;;start+=250){
      const {data,error}=await db.rpc('creator_client_roster').order('joined_at',{ascending:false}).order('id').range(start,start+249);
      if(run!==generation)return;
      if(error)throw error;
      next.push(...data);
      if(data.length<250)break;
    }
    const [alerts,statuses]=await Promise.all([db.rpc('creator_unread_clients'),db.rpc('creator_reported_statuses')]);
    const reports=new Map((statuses.data||[]).map(s=>[s.client_id,s]));
    for(const row of next)row.report=reports.get(row.id);
    if(run!==generation)return;
    rows.splice(0,rows.length,...next);
    if(!alerts.error){unread.clear();for(const item of alerts.data)unread.add(item.id);}
    render();
  }
  try{
    await fetchRows();
    if(run!==generation)return;
    const mark=event=>{if(unread.delete(event.detail))render();};
    window.addEventListener('coaching-read',mark);
    removeMark=()=>window.removeEventListener('coaching-read',mark);
    timer=setInterval(()=>{if(!document.hidden&&!root.hidden&&!document.querySelector('dialog[open]'))fetchRows().catch(()=>{});},30000);
    search.oninput=()=>{query=search.value;render();};
    filter.onchange=()=>{status=filter.value;render();};
    ordering.onchange=()=>{sort=ordering.value;render();};
  }catch{out.textContent='Couldn’t load your clients. ';const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>liveRoster(owner,preview);out.append(retry);return;}
  out.onclick=async event=>{
    const b=event.target.closest('button');if(!b)return;
    const id=b.dataset.feed||b.dataset.pdf||b.dataset.photo,client=rows.find(c=>c.id===id);if(!client)return;
    if(b.dataset.feed){await openCoachingFeed(client);return;}
    const isPdf=Boolean(b.dataset.pdf);
    const dialog=document.querySelector('#panel').closest('dialog');
    const panel=dialog.querySelector('#panel');
    dialog.querySelector('#panelTitle').textContent=(isPdf?'Onboarding summary':'Before photo')+' · '+client.name;
    const loading=document.createElement('p');loading.textContent='Loading…';panel.replaceChildren(loading);dialog.showModal();
    try{
      let blob;
      if(isPdf){
        const {data:{session}}=await db.auth.getSession();
        if(!session || session.user.id!==owner)throw Error();
        const res=await fetch(SUPABASE_URL+'/functions/v1/client-summary',{method:'POST',cache:'no-store',headers:{apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({id})});
        if(!res.ok || !res.headers.get('content-type')?.includes('application/pdf'))throw Error();
        blob=await res.blob();
      }else{
        const {data,error}=await db.storage.from('client-progress').download(owner+'/'+id+'/before');
        if(error)throw error;blob=data;
      }
      if(!dialog.open||!loading.isConnected||run!==generation)return;
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.textContent=isPdf?'Download PDF':'Download photo';link.download=(client.name||'Client')+(isPdf?' - onboarding.pdf':' - before photo');
      const view=document.createElement(isPdf?'iframe':'img');view.src=url;view.className='client-file';
      if(isPdf)view.title='Onboarding summary';else view.alt='Before photo shared by '+client.name;
      panel.replaceChildren(link,view);
      dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);panel.replaceChildren();},{once:true});
    }catch{loading.textContent='Couldn’t open this file. Close this window and try again.';}
  };
}
