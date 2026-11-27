import {createClient} from 'npm:@supabase/supabase-js@2.49.8';
const headers={'Access-Control-Allow-Origin':'https://coachlineai.github.io','Access-Control-Allow-Headers':'apikey,content-type','Cache-Control':'no-store'};
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return new Response(null,{status:405,headers});
  const input=await req.json().catch(()=>null);
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input?.ticket||''))return new Response(null,{status:403,headers});
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:path,error}=await db.rpc('client_dashboard_image',{ticket:input.ticket,event_id:input.eventId??null});
  if(error||!path)return new Response(null,{status:404,headers});
  const asset=await db.storage.from('client-progress').download(path);
  if(asset.error)return new Response(null,{status:503,headers});
  return new Response(asset.data,{headers:{...headers,'Content-Type':asset.data.type,'X-Content-Type-Options':'nosniff'}});
});
