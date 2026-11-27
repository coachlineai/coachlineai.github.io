export const consentCopy='Want personalized plans and weekly check-ins? Google Gemini processes your questionnaire, any check-in photos you choose to share, and workout screenshots. Your trainer can view the messages and uploads. Reply COACH ON to agree or COACH OFF anytime to turn this off.';
type Database = any;
export async function read(query:any){const r=await query;if(r.error)throw r.error;return r.data;}
export const profileFields='client_key,creator_id,phone,first_name,sex,birth_date,workouts,coaching_goal,coaching_motivation,coaching_barrier,height_cm,weight_kg,target_weight_kg,weekly_pace_lb,workout_styles,session_length,food_allergies,other_food_allergy,has_trainer,referral_source,tried_calorie_apps,tried_fitness_apps,photo_saved_at,photo_skipped_at,voice_imessage,coaching_processing_consent_at,coaching_paused,completed_at';
export function modelProfile(row:any){
  const {client_key,creator_id,phone,photo_saved_at,photo_skipped_at,voice_imessage,coaching_processing_consent_at,coaching_paused,completed_at,birth_date,...answers}=row;
  const today=new Date().toISOString().slice(0,10);
  const age=birth_date?Number(today.slice(0,4))-Number(birth_date.slice(0,4))-Number(today.slice(5)<birth_date.slice(5)):null;
  if(age===null || age<18)for(const k of ['target_weight_kg','weekly_pace_lb','weight_kg','height_cm'])delete answers[k];
  return {...answers,age};
}
export async function activity(db:Database,id:string,key:string,kind:string,body:string,extra:Record<string,unknown>={}){
  await read(db.from('client_activity').upsert({client_id:id,event_key:key,kind,body,...extra},{onConflict:'client_id,event_key',ignoreDuplicates:true}));
}
export async function currentPlans(db:Database,id:string){
  const latest=async(kind:string)=>(await read(db.from('client_activity').select('body').eq('client_id',id).eq('kind',kind).order('id',{ascending:false}).limit(1)))[0]?.body||'';
  const [meal,workout,allergies]=await Promise.all(['meal','workout','allergies'].map(latest));
  return {meal,workout,allergies};
}
export async function generate(parts:any[],instruction:string,schema:any,timeoutMs=30000){
  const model=encodeURIComponent(Deno.env.get('GEMINI_MODEL')||'gemini-3.1-flash-lite');
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':Deno.env.get('GEMINI_API_KEY')!},
    signal:AbortSignal.timeout(timeoutMs),body:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{role:'user',parts}],
    generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens:3200}})});
  if(!r.ok)throw Error('Coaching model unavailable');
  const candidate=(await r.json()).candidates?.[0];
  if(candidate?.finishReason!=='STOP')throw Error('Incomplete coaching response');
  return JSON.parse(candidate.content.parts.filter((x:any)=>!x.thought).map((x:any)=>x.text||'').join(''));
}
export async function job(db:Database,id:string,key:string,kind:string,input:any={}){
  await read(db.from('coaching_jobs').upsert({client_id:id,job_key:key,kind,input},{onConflict:'client_id,job_key',ignoreDuplicates:true}));
}
const weekMs=7*86400000;
export async function captureCycle(db:Database,c:any,text:string,media:string,handle:string,loadPhoto:any){
  const id=c.client_key;

  if(!media && /^coach (on|off)$/i.test(text)){
    const enabled=/on$/i.test(text);
    const changed=await read(db.rpc('record_coaching_consent',{client:id,handle,enabled}));
    if(!changed)return true;
    if(enabled){await job(db,id,'consent:'+handle,'reply',{message:'Personalized plans and Friday check-ins are on. When you finish a workout, text WORKOUT DONE. Text MY PLAN for your private dashboard.'});return true;}
    return 'Personalized plans and Friday check-ins are off. Reply COACH ON anytime to restart.';
  }
  if(!c.coaching_processing_consent_at){
    // Tagged private evidence is never sent through ordinary food/equipment analysis.
    if(/^(progress|check[ -]?in|burn|workout done|allergies:)\b/i.test(text) || (!text&&media&&(c.photo_saved_at||c.photo_skipped_at)))return consentCopy;
    return false;
  }
  const latest=async(kinds:string[])=>(await read(db.from('client_activity').select('kind,created_at,id').eq('client_id',id).in('kind',kinds).order('id',{ascending:false}).limit(1)))[0];
  const tag=(word:string)=>new RegExp('^'+word+'(?:\\b|$)','i').test(text);
  const done=/^(?:(?:workout|session|run|leg day) (?:is )?(?:done|complete|finished)|done|(?:i(?:’ve|'ve)? )?(?:just )?(?:finished|completed|wrapped up) (?:my |the |today.s |a )?(?:workout|run|training|session|leg day|upper body workout|lower body workout))(?: today)?[.!✅💪🏽\s]*$/iu.test(text);
  if(!media && done){
    await activity(db,id,'in:'+handle,'workout_done',text);
    await job(db,id,'done:'+handle,'reply',{message:'Workout logged. Send your fitness-app workout screenshot with BURN in the caption so I can log the active calories shown for that session.'});
    return true;
  }
  if(!media){
    const states=[['resting',/^(?:i.m |i am )?(?:resting|taking a rest day|on a rest day)(?: today| now)?[.!]?$/i],
      ['working out',/^(?:i.m |i am )?(?:working out|starting my workout|at the gym)(?: now)?[.!]?$/i],
      ['eating',/^(?:i.m |i am )?(?:eating|having (?:lunch|dinner|breakfast))(?: now)?[.!]?$/i]] as const;
    const match=states.find(([,pattern])=>pattern.test(text));
    if(match)await activity(db,id,'status:'+handle,'client_status',match[0]);
  }
  if(!media && /\b(change|adjust|revise|swap|replace|switch)\b/i.test(text) && /\b(meals?|workouts?|routine|meal prep|training plan)\b/i.test(text)){
    await activity(db,id,'in:'+handle,'checkin_note',text);
    await job(db,id,'revise:'+handle,'revise',{note:text});return true;
  }
  const allergy= !media && text.match(/^allergies\s*[:–-]\s*(.{1,300})$/i);
  if(allergy){
    await activity(db,id,'in:'+handle,'allergies',allergy[1]);
    await job(db,id,'allergies:'+handle,'revise',{note:'Client clarified their food allergies: '+allergy[1]});return true;
  }
  const {age}=modelProfile(c);
  const request=await latest(['friday']);
  const open=request && Date.now()-Date.parse(request.created_at)<weekMs;
  const explicit=tag('progress')||tag('check[ -]?in');
  const wantsBurn=tag('burn')||/\b(?:active calories|workout screenshot|calories burned)\b/i.test(text);
  let burn=wantsBurn;
  if(media && !text){
    const pending=await latest(['workout_done','burn','burn_review','friday']);
    burn=pending?.kind==='workout_done' && Date.now()-Date.parse(pending.created_at)<86400000;
  }
  if(burn && !media){
    if(!tag('burn'))return false;
    await activity(db,id,'in:'+handle,'client',text);
    await job(db,id,'reply:'+handle,'reply',{message:'Attach the workout screenshot with BURN in the caption. Make sure the workout’s active calories are visible.'});return true;
  }
  if(!explicit && !(media && burn))return false;
  if(explicit && media && (age===null||age<18)){
    await activity(db,id,'in:'+handle,'client','Requested a photo check-in.');
    await job(db,id,'reply:'+handle,'reply',{message:'Let’s do your check-in by text. Send CHECKIN with how your workouts, meals, and energy felt.'});return true;
  }
  if(!media){
    const note=text.replace(/^\s*(?:progress|check[ -]?in)\s*[:–-]?\s*/i,'').trim();
    await activity(db,id,'in:'+handle,'checkin_note',text);
    if(!note)await job(db,id,'reply:'+handle,'reply',{message:'How did your workouts and meal prep go? Reply CHECKIN with what felt doable and what you’d change.'});
    else await job(db,id,'review:'+handle,'revise',{note});return true;
  }
  const image=(await loadPhoto(media)).inlineData;
  const bytes=Uint8Array.from(atob(image.data),(x:string)=>x.charCodeAt(0));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const type=burn?'burn':'progress';
  const path=c.creator_id+'/'+id+'/'+type+'/'+hash;
  const store=db.storage.from('client-progress');
  const uploaded=await store.upload(path,bytes,{contentType:image.mimeType,upsert:false});
  if(uploaded.error && (await store.info(path)).error)throw uploaded.error;
  const note=text.replace(/^(?:burn|progress|check[ -]?in)\s*[:–-]?\s*/i,'').trim();
  await activity(db,id,type+'-file:'+hash,burn?'burn_file':'progress',note|| (burn?'Shared a workout screenshot.':'Shared a progress photo.'),{asset:path});
  await job(db,id,type+':'+hash,type==='burn'?'read_burn':'revise',{asset:path,note,hash,checkin:open?request.id:null});
  return true;
}
