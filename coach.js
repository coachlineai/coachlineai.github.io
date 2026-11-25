import {db} from './supabase-client.js';
import {voiceWave,startAudioEngine} from './voice-wave.js';
import qrCode from './vendor/coach-qr.js';
import {phoneNumber} from './profile-render.js';
const choices = {
  tone: ['Personalities · Select any combination', 'Motivating', 'Serious', 'Funny', 'Playful roast'],
  emoji: ['Emoji use', 'None', 'Light', 'Expressive'],
  adjust: ['When a client misses a workout', 'Ask what happened', 'Offer a shorter session', 'Reschedule']
};
const greetings = {
  text: ['What goal are we working toward?', 'How is training going this week?'],
  call: ['What would you like to work on today?', 'How did your last session feel?']
};
function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('coachline-coach-preview', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function initCoach(owner, phone) {
  const root = document.querySelector('#coach-view');
  const $ = selector => root.querySelector(selector);
  const status = $('#coach-status');
  const data = {styleNotes:'', greetingExample:'', tone:['Motivating'], emoji:'Light', adjust:choices.adjust[1], text:greetings.text[0], call:greetings.call[0], consent:false, audio:null};
  let objectUrl, recorder, database, saving = false;
  const save = $('#save-coach'), publish = $('#publish-coach');
  const number = phoneNumber(phone);
  function showNumber(number) {
  if (number) {
    const destination = 'sms:' + number;
    const code = qrCode(0, 'M');
    code.addData(destination);
    code.make();
    $('#coach-qr').innerHTML = code.createSvgTag({cellSize:6, margin:24, scalable:true});
    $('#coach-message').href = destination;
    $('#coach-number').textContent = number;
    $('#coach-contact').hidden = false;
  } else {
    $('#coach-no-number').hidden = false;
  }
  }
  showNumber(number);
  let pilot=false;
  root.inert = true;
  try {
    database = await openStorage();
    const saved = await new Promise((resolve,reject) => {
      const req = database.transaction('settings').objectStore('settings').get(owner + '/draft');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (saved) {
      Object.assign(data,saved);
      const storedTones = Array.isArray(data.tone) ? data.tone : [data.tone];
      data.tone = choices.tone.slice(1).filter(tone => storedTones.includes(tone));
      status.textContent = 'Saved preview on this device';
    }
  } catch {
    status.textContent = 'Device storage unavailable. You can still test settings.';
    save.disabled = publish.disabled = true;
  }
  root.inert = false;
  async function invokePreview(body) {
    const {data,error}=await db.functions.invoke('coach-preview',{body});
    if(error || data?.error) throw Error(data?.error || 'The private preview is unavailable.');
    return data;
  }
  function displayHistory(turns) {
    const rows=turns.map(turn=>{
      const p=document.createElement('p');
      p.textContent=(turn.role==='model'?'Coach: ':'You: ')+turn.parts[0].text;
      return p;
    });
    $('#coach-test-history').replaceChildren(...rows);
  }
  async function initPreview() {
    const result=await invokePreview({action:'status'});
    $('#coach-api-test').hidden=false;
    pilot=true;
    publish.textContent='Publish coaching style';
    if(result.phoneLine) showNumber(result.phoneLine);
    displayHistory(result.history);
    if(!result.geminiConfigured) $('#coach-test-status').textContent='Gemini setup is pending.';
  }
  initPreview().catch(()=>{});
  $('#coach-connect-phone').onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    try {
      await invokePreview({action:'connectPhone'});
      $('#coach-test-status').textContent='Private phone test connected. Text the coach from your registered test phone.';
    } catch(e){$('#coach-test-status').textContent=e.message;}
    finally{button.disabled=false;}
  };
  $('#coach-check-line').onclick=async()=>{
    try {
      const result=await invokePreview({action:'checkLine'});
      $('#coach-test-status').textContent='Sendblue verified your test phone: '+result.service;
    } catch(e){$('#coach-test-status').textContent=e.message;}
  };
  $('#coach-test-form').onsubmit=async event=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button'), input=$('#coach-test-message');
    button.disabled=true;
    $('#coach-test-status').textContent='Waiting for Gemini…';
    try {
      const settings=database ? await new Promise((resolve,reject)=>{
        const read=database.transaction('settings').objectStore('settings').get(owner+'/published');
        read.onsuccess=()=>resolve(read.result); read.onerror=()=>reject(read.error);
      }) : {};
      const {tone,emoji,styleNotes,greetingExample,text}=settings||{};
      const reply=await invokePreview({action:'chat',message:input.value,style:{tone,emoji,styleNotes,greetingExample,text}});
      displayHistory(reply.history); input.value=''; $('#coach-test-status').textContent='';
    } catch(e){$('#coach-test-status').textContent=e.message;}
    finally{button.disabled=false;}
  };
  function changed() {
    status.textContent = 'Unsaved changes · Device preview';
    $('#coach-next').hidden = true;
    render();
  }
  function render() {
    for (const button of root.querySelectorAll('[data-option]')) {
      const key = button.closest('[data-choice]').dataset.choice;
      const selected = key === 'tone' ? data.tone.includes(button.dataset.option) : button.dataset.option === data[key];
      button.setAttribute('aria-pressed', selected);
    }
  }
  for (const [key,[title,...options]] of Object.entries(choices)) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = title;
    group.append(legend);
    for (const value of options) {
      const b = document.createElement('button');
      b.textContent = b.dataset.option = value;
      b.onclick = () => {
        if (key === 'tone') {
          data.tone = data.tone.includes(value) ? data.tone.filter(tone => tone !== value) : [...data.tone, value];
          changed();
        } else { data[key] = value; changed(); }
      };
      group.append(b);
    }
    $('[data-choice="'+key+'"]').append(group);
  }
  for (const key of ['styleNotes', 'greetingExample']) {
    const field = $('#' + key);
    field.value = data[key];
    field.oninput = () => {
      data[key] = field.value;
      changed();
    };
  }
  for (const key of ['text','call']) {
    const select = $('#'+key+'-intro');
    greetings[key].forEach(v => select.add(new Option(v,v)));
    select.value = data[key];
    select.onchange = () => { data[key] = select.value; changed(); };
  }
  const consent = $('#voice-consent'), upload = $('#voice-file'), record = $('#record-coach');
  const player = $('#voice-audio'), voiceStatus = $('#voice-state');
  const wave=voiceWave(root,player);
  function refreshVoice() {
    player.pause();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = data.audio ? URL.createObjectURL(data.audio) : null;
    if (objectUrl) player.src = objectUrl;
    else player.removeAttribute('src');
    player.load();
    wave.sample(data.audio);
    $('#remove-voice').hidden = !objectUrl;
    consent.checked = data.consent;
    upload.disabled = !data.consent;
    record.disabled = !data.consent || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder;
  }
  consent.onchange = () => {
    data.consent = consent.checked;
    if (!data.consent) data.audio = null;
    refreshVoice(); changed();
  };
  function attach(blob) {
    if (blob.size > 10 * 1024 * 1024 || !blob.size) {voiceStatus.textContent = 'Choose a nonempty audio file under 10 MB.'; return;}
    data.audio = blob;
    voiceStatus.textContent = 'Sample ready';
    refreshVoice(); changed();
  }
  upload.onchange = () => {
    const file = upload.files[0];
    if (file?.type.startsWith('audio/')) attach(file);
    else voiceStatus.textContent = 'Choose an audio file.';
    upload.value = '';
  };
  $('#remove-voice').onclick = () => {data.audio = null; voiceStatus.textContent = ''; refreshVoice(); changed();};
  record.onclick = async () => {
    if (recorder?.state === 'recording') { record.disabled=true; recorder.stop(); return; }
    let stream, engine, stopMeter;
    record.disabled = true; consent.disabled = true;
    try {
      player.pause();
      upload.disabled=true;
      engine=startAudioEngine();
      stream = await navigator.mediaDevices.getUserMedia({audio:true});
      recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      if(engine)stopMeter=wave.monitor(stream,engine);
      recorder.start();
      record.textContent = 'Stop recording';
      voiceStatus.textContent = 'Recording up to 30 seconds…';
      record.disabled = false;
      const timer = setTimeout(() => {if (recorder.state === 'recording') recorder.stop();},30000);
      recorder.onstop = () => {
        clearTimeout(timer); stopMeter?.(); engine?.close().catch(()=>{}); stream.getTracks().forEach(t => t.stop());
        consent.disabled = false; record.textContent = 'Record sample';
        const blob=new Blob(chunks,{type:recorder.mimeType});
        if (!blob.size || blob.size>10*1024*1024) refreshVoice();
        attach(blob);
      };
    } catch {
      stopMeter?.(); engine?.close().catch(()=>{});
      stream?.getTracks().forEach(t => t.stop());
      voiceStatus.textContent = 'Microphone unavailable. You can upload an audio file.';
      consent.disabled = false; refreshVoice();
    }
  };
  async function persist(publishing) {
    if (!database || saving) return;
    if (recorder?.state === 'recording' || consent.disabled) {status.textContent = 'Finish recording before saving.'; return;}
    saving = true; root.inert = true;
    if(publishing && pilot){
      const {tone,emoji,styleNotes,greetingExample,text,adjust}=data;
      try {await invokePreview({action:'publishStyle',style:{tone,emoji,styleNotes,greetingExample,text,adjust}});}
      catch(e){status.textContent=e.message; saving=false; root.inert=false;return;}
    }
    const tx = database.transaction('settings','readwrite');
    tx.objectStore('settings').put(data,owner+'/draft');
    if (publishing) tx.objectStore('settings').put(data,owner+'/published');
    tx.oncomplete = () => {
      saving = false; root.inert = false;
      status.textContent = publishing && pilot ? 'Coaching style published' : (publishing ? 'Preview published' : 'Draft saved') + ' on this device';
      $('#coach-next').hidden = !publishing;
    };
    tx.onabort = () => {saving = false; root.inert = false; status.textContent = 'Could not save to this device. Try again.';};
  }
  save.onclick = () => persist(false);
  publish.onclick = () => persist(true);
  $('#keep-testing').onclick = () => {$('#coach-next').hidden = true; (number ? $('#coach-message') : $('#coach-no-number a')).focus();};
  refreshVoice(); render();
}
