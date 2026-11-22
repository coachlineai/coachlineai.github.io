const choices = {
  tone: ['Personalities · Select any combination', 'Motivating', 'Serious', 'Funny', 'Playful roast'],
  emoji: ['Emoji use', 'None', 'Light', 'Expressive'],
  adjust: ['When a client misses a workout', 'Ask what happened', 'Offer a shorter session', 'Reschedule'],
  mode: ['Preview channel', 'Text', 'Call']
};
const scenarios = ['First conversation', 'Missed workout', 'Meal check-in'];
const greetings = {
  text: ['What goal are we working toward?', 'How is training going this week?'],
  call: ['What would you like to work on today?', 'How did your last session feel?']
};
const prompts = {
  Motivating: ['Glad you’re here!', 'One missed day doesn’t erase your progress.', 'Nice job checking in!'],
  Serious: ['Let’s get started.', 'Let’s adjust your plan.', 'Let’s review your meal.'],
  Funny: ['My clipboard and I are ready.', 'Your dumbbells asked if you’re still friends.', 'Time for the lunch report.'],
  'Playful roast': ['Look who showed up for coaching!', 'Your calendar owes you a rematch.', 'Chef, let’s hear what made the menu.']
};
function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('coachline-coach-preview', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function initCoach(owner, name) {
  const root = document.querySelector('#coach-view');
  const $ = selector => root.querySelector(selector);
  const status = $('#coach-status');
  const data = {tone:['Motivating'], emoji:'Light', adjust:choices.adjust[1], text:greetings.text[0], call:greetings.call[0], consent:false, audio:null};
  let mode = 'Text', scenario = 0, objectUrl, recorder, database, saving = false;
  const save = $('#save-coach'), publish = $('#publish-coach');
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
  function changed() {
    status.textContent = 'Unsaved changes · Device preview';
    $('#coach-next').hidden = true;
    render();
  }
  function render() {
    for (const button of root.querySelectorAll('[data-option]')) {
      const key = button.closest('[data-choice]').dataset.choice;
      const selected = key === 'tone' ? data.tone.includes(button.dataset.option) : button.dataset.option === (key === 'mode' ? mode : data[key]);
      button.setAttribute('aria-pressed', selected);
    }
    const call = mode === 'Call';
    $('#coach-name').textContent = name + ' · AI coach';
    $('#scenario-label').hidden = call;
    const chat = $('#coach-chat');
    chat.replaceChildren();
    function line(text, client = false) {
      const p = document.createElement('p');
      if (client) p.className = 'client-line';
      p.textContent = text;
      chat.append(p);
    }
    if (call) {
      line('Hey, this is ' + name + '’s AI coach. ' + data.call);
      if (objectUrl) {
        const playback = document.createElement('audio');
        playback.controls = true;
        playback.src = objectUrl;
        chat.append('Your recorded sample', playback);
      } else line('Add your voice sample to hear it here.');
      return;
    }
    line(['Hey, I’m ready to get started.', 'I missed my workout today.', 'Just finished lunch. Can we log it?'][scenario], true);
    const adjustments = {'Ask what happened':'What got in the way today?', 'Offer a shorter session':'Would a shorter version of your session fit today?', Reschedule:'What day would work better for this session?'};
    const suffix = {None:'',Light:' 💪',Expressive:' 💪🔥'}[data.emoji];
    const question = [data.text, adjustments[data.adjust], 'What did you eat, and roughly how much?'][scenario];
    line([...data.tone.map(tone => prompts[tone][scenario]), question].join(' ') + suffix);
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
        if (key === 'mode') { mode = value; render(); }
        else if (key === 'tone') {
          data.tone = data.tone.includes(value) ? data.tone.filter(tone => tone !== value) : [...data.tone, value];
          changed();
        } else { data[key] = value; changed(); }
      };
      group.append(b);
    }
    $('[data-choice="'+key+'"]').append(group);
  }
  for (const key of ['text','call']) {
    const select = $('#'+key+'-intro');
    greetings[key].forEach(v => select.add(new Option(v,v)));
    select.value = data[key];
    select.onchange = () => { data[key] = select.value; changed(); };
  }
  const scenarioSelect = $('#coach-scenario');
  scenarios.forEach(v => scenarioSelect.add(new Option(v,v)));
  scenarioSelect.onchange = () => { scenario = scenarioSelect.selectedIndex; render(); };
  const consent = $('#voice-consent'), upload = $('#voice-file'), record = $('#record-coach');
  const player = $('#voice-audio'), voiceStatus = $('#voice-state');
  function refreshVoice() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = data.audio ? URL.createObjectURL(data.audio) : null;
    if (objectUrl) player.src = objectUrl;
    else player.removeAttribute('src');
    player.hidden = $('#remove-voice').hidden = !objectUrl;
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
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    let stream;
    record.disabled = true; consent.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio:true});
      recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.start();
      record.textContent = 'Stop recording';
      voiceStatus.textContent = 'Recording up to 30 seconds…';
      record.disabled = false;
      const timer = setTimeout(() => {if (recorder.state === 'recording') recorder.stop();},30000);
      recorder.onstop = () => {
        clearTimeout(timer); stream.getTracks().forEach(t => t.stop());
        consent.disabled = false; record.textContent = 'Record sample';
        attach(new Blob(chunks,{type:recorder.mimeType}));
      };
    } catch {
      stream?.getTracks().forEach(t => t.stop());
      voiceStatus.textContent = 'Microphone unavailable. You can upload an audio file.';
      consent.disabled = false; refreshVoice();
    }
  };
  function persist(publishing) {
    if (!database || saving) return;
    if (recorder?.state === 'recording' || consent.disabled) {status.textContent = 'Finish recording before saving.'; return;}
    saving = true; root.inert = true;
    const tx = database.transaction('settings','readwrite');
    tx.objectStore('settings').put(data,owner+'/draft');
    if (publishing) tx.objectStore('settings').put(data,owner+'/published');
    tx.oncomplete = () => {
      saving = false; root.inert = false;
      status.textContent = (publishing ? 'Preview published' : 'Draft saved') + ' on this device';
      $('#coach-next').hidden = !publishing;
    };
    tx.onabort = () => {saving = false; root.inert = false; status.textContent = 'Could not save to this device. Try again.';};
  }
  save.onclick = () => persist(false);
  publish.onclick = () => persist(true);
  $('#keep-testing').onclick = () => {$('#coach-next').hidden = true; mode='Text'; render(); scenarioSelect.focus();};
  refreshVoice(); render();
}
