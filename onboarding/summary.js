// Each panel is built from the same answers that are submitted to the coach.
export function renderSummary(fields, profile) {
  const {rows, energy, targetDate, goal, direction, units, change, teen, name} = profile;
  const figure = fields.querySelector('figure');
  fields.classList.add('summary');
  document.querySelector('h1').textContent = name + ', here’s your plan.';
  document.querySelector('#hint').textContent = targetDate
    ? 'Your goal is to ' + direction + ' ' + change + ' ' + units + '. At your chosen pace, that’s around ' + targetDate + '.'
    : goal === 'Maintain' ? 'Maintain your weight and build a routine you can stick with.' : 'Your focus is to ' + goal.toLowerCase() + '.';
  const panel = title => {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = title;
    section.append(heading); fields.append(section);
    return section;
  };
  function line(parent, tag, text) {
    const el = document.createElement(tag);
    el.textContent = text; parent.append(el);
    return el;
  }
  if (targetDate) figure.querySelector('figcaption').textContent = 'Estimated progress';
  const nutrition = panel(teen ? 'Nutrition focus' : 'Your daily nutrition');
  if (energy.length) {
    const format = (factor, divisor = 1) => [...new Set(energy.map(v => Math.round(v * factor / divisor).toLocaleString()))].join('–');
    const grid = document.createElement('div'); grid.className = 'nutrition-grid'; nutrition.append(grid);
    for (const [label, value] of [['Calories',format(1)+' kcal'],['Protein',format(.25,4)+' g'],['Carbs',format(.5,4)+' g'],['Fat',format(.25,9)+' g']]) {
      const cell=document.createElement('div'); grid.append(cell); line(cell,'strong',value); line(cell,'small',label);
    }
    const info=document.createElement('details'); nutrition.append(info);
    line(info,'summary','How these estimates work');
    line(info,'p','Your estimate uses your age, measurements, workout frequency and selected pace. The sample split is 50% carbohydrate, 25% protein and 25% fat. Workout calories are already reflected in the activity estimate.');
  } else {
    line(nutrition,'p',teen ? 'Plan regular meals and snacks around school and training. Your coach can help with meal ideas that respect your food allergies.' : 'Start with meals that fit your routine. A registered dietitian can help you choose a personal calorie target.');
  }
  for (const [title, entries] of rows) {
    const section=panel(title), list=document.createElement('dl'); section.append(list);
    for (const [label,value] of entries) { line(list,'dt',label); line(list,'dd',value); }
  }
  const actions=panel('How Coachline can help');
  for (const [title,copy] of [
    ['Snap a meal','Send a food or drink photo for an estimate. Your coach can use your allergy list when suggesting meals.'],
    ['Scan a piece of gym equipment','Photograph the machine to learn what it trains and see a demonstration.'],
    ['Plan your next session','Text your coach for a workout that fits your equipment and the time you have.'],
    ['Share a tracked workout','Text your workout duration or a screenshot from your fitness tracker. Your daily calorie estimate stays the same.']
  ]) { line(actions,'h3',title);line(actions,'p',copy); }
}

export async function prepareSummary(container, name, save) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.innerHTML='<div class="setup-progress"><output></output><h2></h2><progress max="100" value="0" aria-label="Preparing your summary"></progress><p role="status"></p></div>';
  const out=container.querySelector('output'), bar=container.querySelector('progress'), status=container.querySelector('p');
  container.querySelector('h2').textContent=name+', we’re putting your plan together.';
  function paint(n) {
    out.textContent=n+'%'; bar.value=n;
    const message=n<38?'Gathering your selections…':n<72?'Preparing your workout and nutrition summary…':n<100?'Finishing your coaching profile…':'Your summary is ready.';
    if(status.textContent!==message)status.textContent=message;
  }
  paint(0);
  const start=performance.now();
  const tick=setInterval(()=>paint(Math.min(92,Math.round((performance.now()-start)/16))),65);
  try {
    await Promise.all([save(),new Promise(r=>setTimeout(r,reduced?0:1550))]);
    clearInterval(tick);paint(100);
    if(!reduced) await new Promise(r=>setTimeout(r,220));
  } finally {clearInterval(tick);}
}
