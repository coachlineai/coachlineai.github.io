import {createClient} from 'npm:@supabase/supabase-js@2.49.8';

const headers={'Access-Control-Allow-Origin':'https://coachlineai.github.io','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const env=(name:string)=>Deno.env.get(name);
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response(null,{headers});
  if(req.method!=='POST') return reply({error:'POST required'},405);
  const db=createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!);
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token) return reply({error:'Sign in to Coachline.'},401);
  const {data:{user}}=await db.auth.getUser(token);
  if(!user) return reply({error:'Session expired.'},401);
  const session=()=>db.from('coach_preview_sessions').select('history').eq('creator_id',user.id).maybeSingle();
  const current=await session();
  if(current.error) return reply({error:'Preview storage unavailable.'},503);
  if(!current.data) return reply({error:'Private pilot only.'},403);
  const body=await req.json().catch(()=>null);
  if(body?.action==='status') return reply({history:current.data.history,geminiConfigured:!!env('GEMINI_API_KEY')});
  if(body?.action==='checkLine'){
    const id=env('SENDBLUE_API_KEY_ID'), secret=env('SENDBLUE_API_SECRET_KEY'), number=env('SENDBLUE_TEST_NUMBER');
    if(!id||!secret||!number) return reply({error:'Sandbox credentials are missing.'});
    try {
      const res=await fetch('https://api.sendblue.com/api/evaluate-service?'+new URLSearchParams({number}),{headers:{'sb-api-key-id':id,'sb-api-secret-key':secret},signal:AbortSignal.timeout(8000)});
      const result=await res.json();
      return res.ok && result.service ? reply({service:String(result.service)}) : reply({error:'Sendblue lookup returned HTTP '+res.status+'.'});
    } catch{return reply({error:'Sendblue is unavailable.'});}
  }
  const message=body?.message?.trim?.();
  if(body?.action!=='chat'||!message||message.length>1000) return reply({error:'Enter up to 1,000 characters.'},400);
  const key=env('GEMINI_API_KEY');
  if(!key) return reply({error:'Gemini setup is pending.'});
  const id=crypto.randomUUID();
  const reserved=await db.rpc('reserve_coach_preview',{owner_id:user.id,request_id:id});
  if(reserved.error||!reserved.data) return reply({error:'Another reply is pending or today’s 20 preview attempts have been used.'});
  try {
    const {data,error}=await session();
    if(error||!data) throw Error();
    const turn={role:'user',parts:[{text:message}]};
    const history=[...data.history.slice(-14),turn];
    const style=JSON.stringify(body.style??{}).slice(0,1200);
    const model=env('GEMINI_MODEL')||'gemini-3.1-flash-lite';
    const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
      method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),
      body:JSON.stringify({contents:history,systemInstruction:{parts:[{text:'You are Matthias’s AI fitness coach in a private fictional test. Give a concise helpful reply using prior turns. Ask at most one follow-up question. Do not diagnose or claim to be the human trainer. Creator style preferences: '+style}]},generationConfig:{maxOutputTokens:512}})
    });
    if(!res.ok) return reply({error:res.status===429?'Gemini quota reached. Try again later.':'Gemini rejected the request. Check the key and model.'});
    const payload=await res.json();
    const answer=payload.candidates?.[0]?.content?.parts?.filter((p:{thought?:boolean})=>!p.thought).map((p:{text?:string})=>p.text||'').join('').trim();
    if(!answer) return reply({error:'Gemini returned no reply. Try another test message.'});
    history.push({role:'model',parts:[{text:answer}]});
    const saved=await db.from('coach_preview_sessions').update({history,attempt:null}).eq('creator_id',user.id).eq('attempt',id).select('creator_id').single();
    if(saved.error) throw Error();
    return reply({history});
  } catch{return reply({error:'Preview could not finish. Try again.'});}
  finally{await db.from('coach_preview_sessions').update({attempt:null}).eq('creator_id',user.id).eq('attempt',id);}
});
