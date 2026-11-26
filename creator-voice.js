import {db,SUPABASE_URL,PUBLISHABLE_KEY} from './supabase-client.js';

async function wavSample(sample){
  const ctx=new AudioContext();
  let source;
  try{source=await ctx.decodeAudioData(await sample.arrayBuffer());}
  finally{await ctx.close();}
  if(source.duration<5||source.duration>60)throw Error('Use a voice sample between 5 and 60 seconds.');
  const rate=24000,offline=new OfflineAudioContext(1,Math.ceil(source.duration*rate),rate);
  const input=offline.createBufferSource();input.buffer=source;input.connect(offline.destination);input.start();
  const pcm=(await offline.startRendering()).getChannelData(0);
  const bytes=new ArrayBuffer(44+pcm.length*2),v=new DataView(bytes);
  const tag=(at,name)=>new Uint8Array(bytes,at,name.length).set(new TextEncoder().encode(name));
  tag(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);
  v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++){const value=Math.max(-1,Math.min(1,pcm[i]));v.setInt16(44+2*i,Math.round(value*(value<0?32768:32767)),true);}
  return new Blob([bytes],{type:'audio/wav'});
}
export function setupCreatorVoice(getSample){
  const box=document.querySelector('#ai-voice-settings'),status=box.querySelector('[role=status]'),audio=box.querySelector('audio');
  const consent=box.querySelector('input'),buttons=Object.fromEntries([...box.querySelectorAll('[data-voice-action]')].map(b=>[b.dataset.voiceAction,b]));
  let state={},busy=false,url=null;
  async function call(action,form){
    const {data:{session}}=await db.auth.getSession();
    if(!session)throw Error('Sign in again to manage your voice.');
    const headers={apikey:PUBLISHABLE_KEY,Authorization:'Bearer '+session.access_token};
    if(!form)headers['Content-Type']='application/json';
    const res=await fetch(SUPABASE_URL+'/functions/v1/creator-voice',{method:'POST',headers,body:form||JSON.stringify({action})});
    if(!res.ok)throw Error((await res.json().catch(()=>({}))).error||'Couldn’t reach your voice settings. Try again.');
    return action==='preview'?await res.blob():await res.json();
  }
  function draw(){
    consent.parentElement.hidden=!!state.exists;
    for(const [action,b] of Object.entries(buttons)){
      b.hidden=action==='create'?!!state.exists:action==='remove'? !state.exists:action==='disable'?!state.enabled:action==='enable'?(!state.previewed||state.enabled):!state.created;
      b.disabled=busy||(action!=='disable'&&!state.configured)||(action==='create'&&(!getSample()||!consent.checked));
    }
  }
  async function load(){state=await call('status');draw();}
  consent.onchange=draw;
  box.onclick=async e=>{
    const action=e.target.closest('button')?.dataset.voiceAction;
    if(!action||busy)return;
    busy=true;draw();
    try{
      if(action==='create'){
        const sample=getSample();if(!sample||!consent.checked)throw Error('Record a sample and confirm permission.');
        status.textContent='Creating your private voice…';
        const form=new FormData();form.append('sample',await wavSample(sample),'CoachSample.wav');form.append('consent','my-own-voice-v1');
        await call(action,form);
      }else{
        if(action==='remove'&&!window.confirm('Remove your private Fish Audio voice and turn off voice notes?'))return;
        const result=await call(action);
        if(action==='preview'){
          if(url)URL.revokeObjectURL(url);
          url=URL.createObjectURL(result);audio.src=url;audio.hidden=false;audio.load();
          await audio.play().catch(()=>{});
        }
        if(action==='remove'){if(url)URL.revokeObjectURL(url);url=null;audio.pause();audio.removeAttribute('src');audio.hidden=true;consent.checked=false;}
      }
      await load();
      status.textContent=({create:'Voice submitted. Preview it when training finishes.',preview:'Listen to the preview, then enable voice notes when you’re ready.',enable:'Voice notes are on. Clients can text VOICE ON in iMessage.',disable:'Voice notes are paused.',remove:'Private AI voice removed.'})[action];
    }catch(err){status.textContent=err.message;}
    finally{busy=false;draw();}
  };
  load().then(()=>{status.textContent=!state.configured?'Fish Audio setup is pending. You can record a sample here.':state.enabled?'Voice notes are on. Clients can text VOICE ON in iMessage.':state.created?'Your private voice is ready to preview.':'Record a sample to create your private voice.';}).catch(e=>{status.textContent=e.message;});
  return draw;
}
