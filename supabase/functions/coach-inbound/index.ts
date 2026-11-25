import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { trainerInstructions } from '../_shared/trainer.ts';

const env = (name: string) => Deno.env.get(name);
const done = () => new Response(null, { status: 204 });
Deno.serve(async req => {
  if (req.method !== 'POST') return new Response(null, {status:405});
  const signature = req.headers.get('sb-signing-secret');
  if (!signature || !/^[0-9a-f-]{36}$/i.test(signature)) return new Response(null,{status:401});
  const db = createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:pilot,error} = await db.from('coach_preview_sessions').select('creator_id,phone_line,published_style').eq('webhook_secret',signature).maybeSingle();
  if (error) return new Response(null,{status:503});
  if (!pilot || !pilot.phone_line) return new Response(null,{status:401});
  const m = await req.json().catch(()=>null);
  const tester = env('SENDBLUE_TEST_NUMBER');
  if (!tester || m?.is_outbound !== false || m.from_number !== tester || m.to_number !== pilot.phone_line || m.opted_out || m.group_id) return done();
  if (typeof m.content !== 'string' || !m.content.trim() || m.content.length>1000 || typeof m.message_handle !== 'string' || !m.message_handle || m.message_handle.length>200) return done();
  if (/^(stop|stopall|unsubscribe|cancel|end|quit|start|help)$/i.test(m.content.trim())) return done();
  const {data:claim,error:claimError} = await db.rpc('claim_phone_turn',{owner_id:pilot.creator_id,inbound_handle:m.message_handle,question_text:m.content});
  if (claimError || claim==='busy') return new Response(null,{status:503});
  if (claim!=='claimed') return done();
  const turns=db.from('coach_phone_turns');
  let phase='generation_failed';
  try {
    const {data:previous,error} = await turns.select('question,answer').eq('creator_id',pilot.creator_id).eq('state','accepted').order('received_at',{ascending:false}).limit(7);
    if(error) throw error;
    const contents=previous.reverse().flatMap(t=>[{role:'user',parts:[{text:t.question}]},{role:'model',parts:[{text:t.answer}]}]);
    contents.push({role:'user',parts:[{text:m.content}]});
    const model=encodeURIComponent(env('GEMINI_MODEL')||'gemini-3.1-flash-lite');
    const generation=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':env('GEMINI_API_KEY')!,'Content-Type':'application/json'},signal:AbortSignal.timeout(22000),body:JSON.stringify({contents,systemInstruction:{parts:[{text:trainerInstructions(pilot.published_style)}]},generationConfig:{maxOutputTokens:512}})});
    if(!generation.ok) throw Error();
    const parts=(await generation.json()).candidates?.[0]?.content?.parts||[];
    const answer=parts.filter((p:{thought?:boolean})=>!p.thought).map((p:{text?:string})=>p.text||'').join('').trim();
    if(!answer) throw Error();
    phase='delivery_unconfirmed';
    const sent=await fetch('https://api.sendblue.co/api/send-message',{method:'POST',headers:{'sb-api-key-id':env('SENDBLUE_API_KEY_ID')!,'sb-api-secret-key':env('SENDBLUE_API_SECRET_KEY')!,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({number:tester,from_number:pilot.phone_line,content:answer})});
    if(!sent.ok || !(await sent.json()).message_handle) throw Error();
    await turns.update({state:'accepted',answer}).eq('handle',m.message_handle);
  } catch {
    await turns.update({state:phase}).eq('handle',m.message_handle);
  }
  return done();
});
