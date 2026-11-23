const bars = 44;
const AudioEngine = window.AudioContext || window.webkitAudioContext;

export function voiceWave(root, player) {
  const get = id => root.querySelector('#' + id);
  const panel = get('voice-wave'), play = get('voice-play'), seek = get('voice-seek');
  const canvas = get('voice-bars'), ctx = canvas.getContext('2d');
  const level = get('voice-level'), time = get('voice-time');
  let peaks = [], duration = 0, version = 0, monitoring = false;
  const clock = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  function paint(progress=0) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const step = canvas.width / bars;
    ctx.lineWidth=step*.4; ctx.lineCap='round';
    peaks.forEach((value,i)=>{
      const half=Math.max(1,value*(canvas.height*.46));
      ctx.strokeStyle=i/bars<progress?'#13627e':'#2fa5c4';
      ctx.beginPath();ctx.moveTo((i+.5)*step,canvas.height/2-half);
      ctx.lineTo((i+.5)*step,canvas.height/2+half);ctx.stroke();
    });
  }
  function sync() {
    if(monitoring)return;
    const total=Number.isFinite(player.duration)?player.duration:duration;
    const now=player.currentTime||0;
    play.textContent=player.paused?'▶':'Ⅱ';
    play.setAttribute('aria-label',player.paused?'Play voice sample':'Pause voice sample');
    seek.disabled=!total;seek.max=total||1;seek.value=now;
    time.textContent=clock(now)+' / '+clock(total);
    paint(total?now/total:0);
  }
  for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended'])player.addEventListener(event,sync);
  play.onclick=async()=>{
    if(!player.paused){player.pause();return;}
    try {await player.play();}catch{get('voice-state').textContent='Unable to play this audio format.';}
  };
  seek.oninput=()=>{player.currentTime=Number(seek.value);sync();};
  async function sample(blob) {
    const token=++version;
    monitoring=false;panel.hidden=!blob;level.hidden=true;play.hidden=seek.hidden=false;
    duration=0;peaks=[];sync();
    if(!blob||!AudioEngine)return;
    let decoder;
    try {
      decoder=new AudioEngine();
      const buffer=await decoder.decodeAudioData(await blob.arrayBuffer());
      if(token!==version)return;
      duration=buffer.duration;
      const samples=buffer.getChannelData(0), width=samples.length/bars;
      peaks=Array.from({length:bars},(_,i)=>{
        let max=0;
        for(let j=Math.floor(i*width);j<Math.floor((i+1)*width);j++)max=Math.max(max,Math.abs(samples[j]));
        return max;
      });
      const max=Math.max(.01,...peaks);
      peaks=peaks.map(v=>v/max);sync();
    }catch{if(token===version)sync();}finally{decoder?.close().catch(()=>{});}
  }
  function monitor(stream,engine) {
    ++version;monitoring=true;panel.hidden=false;level.hidden=false;play.hidden=seek.hidden=true;
    peaks=Array(bars).fill(0);
    const start=performance.now();
    let frame=0, last=0;
    const analyser=engine.createAnalyser();analyser.fftSize=2048;
    const input=engine.createMediaStreamSource(stream);input.connect(analyser);
    const samples=new Float32Array(analyser.fftSize);
    function tick(t){
      if(t-last>=75){
        last=t;analyser.getFloatTimeDomainData(samples);
        let sum=0,peak=0;
        for(const v of samples){sum+=v*v;peak=Math.max(peak,Math.abs(v));}
        const rms=Math.sqrt(sum/samples.length);
        peaks.shift();peaks.push(Math.min(1,Math.sqrt(rms)*1.8));paint();
        const label=peak>=.96?'Too loud · move back':rms<.004?'Very quiet · speak closer':rms<.025?'Low input':'Voice detected';
        if(level.textContent!==label)level.textContent=label;
        time.textContent=clock(Math.min(30,(t-start)/1000))+' / 0:30';
      }
      frame=requestAnimationFrame(tick);
    }
    tick(start);
    return ()=>{cancelAnimationFrame(frame);input.disconnect();analyser.disconnect();monitoring=false;};
  }
  return {sample,monitor};
}
export function startAudioEngine(){
  if(!AudioEngine)return null;
  const engine=new AudioEngine();
  engine.resume().catch(()=>{});
  return engine;
}
