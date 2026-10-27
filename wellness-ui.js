// Live UI only: no mock records or shared fitness-data.json.
export function initWellness({ apiFetch, state, setAppScreen, setBanner, loadDay, escapeHtml: esc, localDateString }) {
  const $ = id => document.getElementById(id);
  const today = () => localDateString(new Date());
  const fmt = n => Number(n).toLocaleString(undefined, {maximumFractionDigits:1});
  const dateText = d => new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
  const units = {calories:'kcal',protein:'g',carbs:'g',fat:'g',sugars:'g',fiber:'g',sodium:'mg',saturatedFat:'g'};
  const names = {calories:'Calories',protein:'Protein',carbs:'Carbs',fat:'Fat',sugars:'Sugar',fiber:'Fiber',sodium:'Sodium',saturatedFat:'Saturated fat'};
  let targets = {}, totals = {}, goals = {}, records = [], fitnessReady = false, targetsReady = false, range = 90;
  let fitnessRequest = 0;
  const activeSaves = new Set();
  const optionalNumber = id => $(id).value === '' ? null : Number($(id).value);
  const message = error => error.status===404 ? 'Goals and fitness tracking need the updated service. Food logging is available.' : error.message || 'Unable to load goals.';
  const targetInput = key => `<label>${names[key]} (${units[key]})<input id="goal-${key}" type="number" min="0.1" step="any" max="${key==='calories'||key==='sodium'?100000:10000}" placeholder="No target"></label>`;
  $('target-fields').innerHTML = ['calories','protein','carbs','fat'].map(targetInput).join('');
  $('extra-target-fields').innerHTML = ['sugars','fiber','sodium','saturatedFat'].map(targetInput).join('');

  async function save(form, action) {
    if(activeSaves.has(form)) return;
    activeSaves.add(form);
    const button = form.querySelector('[type=submit]');
    if(button) button.disabled=true;
    try { await action(); } catch(error) { setBanner(message(error),'error'); }
    finally { activeSaves.delete(form); if(button)button.disabled=false; }
  }
  function paintProgress(key,value,goal,known=true) {
    const bar=$('progress-'+key);
    bar.hidden=!goal||!known;
    if(!bar.hidden){bar.value=Math.min(100,value/goal*100);bar.classList.toggle('over',value>goal);
      bar.setAttribute('aria-valuetext',`${fmt(value)} of ${fmt(goal)} ${units[key]}; ${fmt(Math.abs(goal-value))} ${value>goal?'over target':'remaining'}`);}
  }
  function drawNutrition(value=totals) {
    totals=value;
    for(const key of Object.keys(units)) {
      const macro=['calories','protein','carbs','fat'].includes(key);
      // Older entries can lack nutrients: show known totals without treating missing as zero.
      const values=state.entries.map(e=>e.nutrients?.[key]).filter(v=>v!==null&&v!==undefined);
      const known=macro||!state.entries.length||values.length>0;
      const n=macro?Number(value[key]||0):values.reduce((a,b)=>a+Number(b),0);
      $('total-'+key).textContent=known?fmt(n)+(macro?'':' '+units[key]):'—';
      $('target-'+key).textContent=targets[key]?` / ${fmt(targets[key])} ${units[key]}`:macro?' '+units[key]:'';
      paintProgress(key,n,targets[key],known);
    }
    const c=Number(value.calories||0),goal=targets.calories;
    $('calorie-remaining').textContent=goal?(c===goal?'Target reached':`${fmt(Math.abs(goal-c))} kcal ${c>goal?'over target':'remaining'}`):'Set your daily targets';
    $('calorie-percent').textContent=goal?Math.round(c/goal*100)+'%':'';
    const missing=state.entries.some(e=>['sugars','fiber','sodium','saturatedFat'].some(k=>e.nutrients?.[k]==null));
    $('nutrient-coverage').hidden=!missing;
    $('nutrient-coverage').textContent='Some foods have incomplete nutrient data. Totals include known values only.';
    $('recent-food').innerHTML=state.entries.length?state.entries.slice(-3).map(e=>`<div class="section-heading recent-row"><div><h3>${esc(e.foodNameSnapshot)}</h3><span class="small-note">${esc(e.meal)}</span></div><span>${fmt(e.calories)} kcal</span></div>`).join(''):'<p class="empty-state">No food logged for this date.</p>';
  }
  function useTargets(payload) {
    targets=payload?.targets||{};targetsReady=!!payload;
    Object.keys(units).forEach(k=>$('goal-'+k).value=targets[k]??'');
    $('targets-scope').value=payload?.scope||'ongoing';
    $('targets-form').querySelector('[type=submit]').disabled=!targetsReady;
  }
  function syncDate() {
    const current=state.currentDate;
    $('date-label').textContent=(current===today()?'Today · ':'')+dateText(current);
    $('dashboard-date').max=today();$('dashboard-date').value=current;
    $('next-day').disabled=current>=today();$('back-to-today').hidden=current===today();
    $('nutrition-heading').textContent=current===today()?'Today’s nutrition':'Daily nutrition';
    document.querySelectorAll('.selected-day').forEach(el=>el.textContent='Date: '+dateText(current));
  }
  async function navigateDate(date) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today())return;
    try {await loadDay(date);}catch(error){setBanner(error.message,'error');}
  }
  for(const [id,delta] of [['previous-day',-1],['next-day',1]])$(id).addEventListener('click',()=>{const d=new Date(state.currentDate+'T12:00:00');d.setDate(d.getDate()+delta);navigateDate(localDateString(d));});
  $('back-to-today').addEventListener('click',()=>navigateDate(today()));
  $('dashboard-date').addEventListener('click',()=>{try{$('dashboard-date').showPicker?.();}catch{}});
  $('targets-form').addEventListener('submit',event=>{event.preventDefault();if(!targetsReady)return;const date=state.currentDate;
    save(event.target,async()=>{await apiFetch('/api/wellness/targets',{method:'PUT',body:JSON.stringify({effectiveDate:date,scope:$('targets-scope').value,targets:Object.fromEntries(Object.keys(units).map(k=>[k,optionalNumber('goal-'+k)]))})});
      await loadDay(date);setAppScreen('today');setBanner('Targets saved.','success');});});

  function addStrengthRow(exercise='',target='') {
    const row=document.createElement('div');row.className='strength-fields';
    row.innerHTML=`<label>Exercise<input class="strength-name" required maxlength="80" value="${esc(exercise)}"></label><label>Target (lb)<input class="strength-target" type="number" min="0.1" max="5000" step="0.1" required value="${esc(String(target))}"></label><button type="button" class="ghost-action" aria-label="Remove exercise">×</button>`;
    row.querySelector('button').addEventListener('click',()=>row.remove());$('strength-goal-fields').append(row);
  }
  $('add-strength-goal').addEventListener('click',()=>{if($('strength-goal-fields').children.length<30)addStrengthRow();});
  $('fitness-goals-form').addEventListener('submit',event=>{event.preventDefault();if(!fitnessReady)return;
    const payload={weight:optionalNumber('weight-goal'),walking:optionalNumber('walking-goal'),walkingYear:Number($('walking-year').value),strength:Array.from(document.querySelectorAll('.strength-fields')).map(row=>({exercise:row.querySelector('.strength-name').value.trim(),target:Number(row.querySelector('.strength-target').value)}))};
    save(event.target,async()=>{await apiFetch('/api/wellness/goals',{method:'PUT',body:JSON.stringify(payload)});await loadFitness();setAppScreen('goals');setBanner('Goals saved.','success');});});
  function openRecord(kind,record=null) {
    if(!fitnessReady){setBanner('Fitness tracking is unavailable. Check the service update.','error');return;}
    $('fitness-record-form').reset();$('fitness-kind').value=kind;
    $('fitness-record-id').value=record?.id||crypto.randomUUID();
    $('fitness-date').value=record?.entryDate||today();$('fitness-date').max=today();
    $('fitness-form-title').textContent=(record?'Edit ':'Log ')+{walk:'walk',weight:'weight',lift:'lift'}[kind];
    $('fitness-value-label').textContent=kind==='walk'?'Distance (mi)':'Weight (lb)';
    $('fitness-value').max=kind==='walk'?1000:kind==='weight'?2000:5000;
    $('fitness-value').value=record?.value??'';
    $('exercise-field').hidden=kind!=='lift';$('fitness-exercise').required=kind==='lift';$('fitness-exercise').value=record?.exercise||'';
    $('reps-field').hidden=kind!=='lift';$('fitness-reps').value=record?.reps??'';
    $('duration-field').hidden=kind!=='walk';$('fitness-duration').value=record?.durationMinutes??'';
    setAppScreen('fitness-log');
  }
  $('fitness-record-form').addEventListener('submit',event=>{event.preventDefault();if(!fitnessReady)return;
    const kind=$('fitness-kind').value,payload={kind,entryDate:$('fitness-date').value,value:Number($('fitness-value').value)};
    if(kind==='lift'){payload.exercise=$('fitness-exercise').value.trim();payload.reps=optionalNumber('fitness-reps');}
    if(kind==='walk')payload.durationMinutes=optionalNumber('fitness-duration');
    const id=$('fitness-record-id').value;
    save(event.target,async()=>{await apiFetch('/api/wellness/records/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(payload)});await loadFitness();setAppScreen('goals');setBanner('Record saved.','success');});});
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;
    if(button.dataset.recordKind)openRecord(button.dataset.recordKind);
    if(button.dataset.editFitness){const record=records.find(r=>r.id===button.dataset.editFitness);if(record)openRecord(record.kind,record);}
    if(button.dataset.deleteFitness&&window.confirm('Delete this fitness record?'))save($('fitness-record-form'),async()=>{await apiFetch('/api/wellness/records/'+encodeURIComponent(button.dataset.deleteFitness),{method:'DELETE'});await loadFitness();setBanner('Record deleted.','success');});
    if(button.dataset.chartDays){range=Number(button.dataset.chartDays);renderFitness();}
  });
  const bar=(current,target,label)=>target?`<progress max="100" value="${Math.min(100,current/target*100)}" aria-label="${esc(label)}" aria-valuetext="${fmt(current)} of ${fmt(target)}"></progress>`:'';
  function weightChart(weights) {
    const cutoff=new Date(today()+'T12:00:00');cutoff.setDate(cutoff.getDate()-range);
    const daily=new Map(); // records sorted newest first: keep latest saved observation per date.
    for(const r of weights)if(r.entryDate>=localDateString(cutoff)&&!daily.has(r.entryDate))daily.set(r.entryDate,r);
    const points=[...daily.values()].sort((a,b)=>a.entryDate.localeCompare(b.entryDate));
    if(!points.length)return '<p class="empty-state">No weigh-ins in this period.</p>';
    const values=points.map(r=>r.value);if(goals.weight)values.push(goals.weight);
    const low=Math.min(...values)-2,high=Math.max(...values)+2;
    const start=new Date(points[0].entryDate+'T12:00:00').getTime(),end=new Date(points.at(-1).entryDate+'T12:00:00').getTime();
    const x=r=>end===start?160:12+(new Date(r.entryDate+'T12:00:00').getTime()-start)/(end-start)*296;
    const y=v=>140-(v-low)/(high-low)*120;
    const path=points.map((r,i)=>`${i?'L':'M'}${x(r)},${y(r.value)}`).join(' ');
    return `<div class="section-heading small-note"><span>Weight (lb)</span><span>${fmt(low)}–${fmt(high)} lb</span></div><svg class="fitness-chart" viewBox="0 0 320 160" role="img" aria-label="Weight history from ${esc(dateText(points[0].entryDate))} to ${esc(dateText(points.at(-1).entryDate))}. ${points.length} daily observations."><path d="M12 20H308 M12 80H308 M12 140H308" fill="none" stroke="#e2e6eb"/>${goals.weight?`<path d="M12 ${y(goals.weight)}H308" stroke="#606b79" stroke-dasharray="5 5"/>`:''}<path d="${path}" fill="none" stroke="#203e65" stroke-width="2.5"/>${points.map(r=>`<circle cx="${x(r)}" cy="${y(r.value)}" r="3" fill="#203e65"><title>${esc(dateText(r.entryDate))}: ${fmt(r.value)} lb</title></circle>`).join('')}</svg><div class="section-heading small-note"><span>${esc(dateText(points[0].entryDate))}</span><span>${esc(dateText(points.at(-1).entryDate))}</span></div>${goals.weight?`<p class="small-note">Dashed line: ${fmt(goals.weight)} lb target</p>`:''}`;
  }
  function renderFitness(){
    const weights=records.filter(r=>r.kind==='weight'),latest=weights[0];
    const walking=records.filter(r=>r.kind==='walk'&&r.entryDate.startsWith(String(goals.walkingYear))).reduce((sum,r)=>sum+r.value,0);
    $('fitness-overview').innerHTML=`<div class="section-heading"><div><h3>Body weight</h3><span class="small-note">${goals.weight?'Goal '+fmt(goals.weight)+' lb':'No target set'}</span></div><strong>${latest?fmt(latest.value)+' lb':'No weigh-ins'}</strong></div><div class="section-heading"><div><h3>Walking · ${goals.walkingYear}</h3><span class="small-note">${goals.walking?'Goal '+fmt(goals.walking)+' mi':'No target set'}</span></div><strong>${fmt(walking)} mi</strong></div><button class="text-action" data-record-kind="walk">＋ Log walk</button>`;
    $('fitness-dashboard').innerHTML=`<section class="card"><div class="section-heading"><h2>Weight trend</h2><span class="small-note">${goals.weight?'Goal '+fmt(goals.weight)+' lb':''}</span></div><div class="fitness-stat">${latest?fmt(latest.value)+' lb':'—'}</div>${latest?`<p class="small-note">${esc(dateText(latest.entryDate))}</p>`:''}<div class="chart-range">${[[30,'1 month'],[90,'3 months'],[365,'1 year']].map(([n,label])=>`<button type="button" data-chart-days="${n}" aria-pressed="${n===range}">${label}</button>`).join('')}</div>${weightChart(weights)}</section><section class="card" style="margin-top:16px"><h2>Walking · ${goals.walkingYear}</h2><div class="fitness-stat">${fmt(walking)} <span class="target-value">${goals.walking?'/ '+fmt(goals.walking):''} mi</span></div>${bar(walking,goals.walking,'Walking progress')}</section><section style="margin-top:22px"><h2>Strength goals</h2>${(goals.strength||[]).length?goals.strength.map(g=>{const lifts=records.filter(r=>r.kind==='lift'&&r.exercise.toLocaleLowerCase()===g.exercise.toLocaleLowerCase()),best=lifts.length?Math.max(...lifts.map(r=>r.value)):0;return `<div class="fitness-row"><div class="section-heading"><h3>${esc(g.exercise)}</h3><span>${fmt(best)} / ${fmt(g.target)} lb</span></div>${bar(best,g.target,g.exercise)}</div>`}).join(''):'<p class="empty-state">No strength goals yet. Choose Edit goals to add one.</p>'}</section>`;
    $('fitness-history').innerHTML=records.length?records.map(r=>`<div class="fitness-row"><div class="section-heading"><h3>${esc(r.kind==='lift'?r.exercise:r.kind==='walk'?'Walk':'Weight')}</h3><strong>${fmt(r.value)} ${r.unit}</strong></div><span class="small-note">${esc(dateText(r.entryDate))}${r.reps?' · '+r.reps+' reps':''}${r.durationMinutes?' · '+fmt(r.durationMinutes)+' min':''}</span><div class="actions-row"><button class="text-action" data-edit-fitness="${esc(r.id)}">Edit</button><button class="danger-action" data-delete-fitness="${esc(r.id)}">Delete</button></div></div>`).join(''):'<p class="empty-state">No records yet.</p>';
  }
  async function loadFitness(){
    const request=++fitnessRequest;
    try {
      const [g,payload]=await Promise.all([apiFetch('/api/wellness/goals'),apiFetch('/api/wellness/records?through='+today())]);
      if(request!==fitnessRequest)return;
      if(payload.truncated)throw new Error('Fitness history exceeds the display limit. A paginated service update is needed to show complete totals.');
      goals={weight:null,walking:null,walkingYear:new Date().getFullYear(),strength:[],...g};
      records=(payload.records||[]).sort((a,b)=>b.entryDate.localeCompare(a.entryDate)||String(b.updatedAt).localeCompare(String(a.updatedAt)));
      fitnessReady=true;$('wellness-status').textContent='';
      $('weight-goal').value=goals.weight??'';$('walking-goal').value=goals.walking??'';$('walking-year').value=goals.walkingYear;
      $('strength-goal-fields').innerHTML='';goals.strength.forEach(g=>addStrengthRow(g.exercise,g.target));
      $('known-exercises').innerHTML=goals.strength.map(g=>`<option value="${esc(g.exercise)}"></option>`).join('');
      $('fitness-goals-form').querySelector('[type=submit]').disabled=false;renderFitness();
    }catch(error){if(request!==fitnessRequest)return;fitnessReady=false;$('wellness-status').textContent=message(error);$('fitness-overview').textContent=message(error);$('fitness-dashboard').textContent='';$('fitness-history').textContent='';$('fitness-goals-form').querySelector('[type=submit]').disabled=true;}
  }
  function clearDay(){totals={};useTargets(null);for(const key of Object.keys(units)){$('total-'+key).textContent='—';$('target-'+key).textContent='';$('progress-'+key).hidden=true;}$('calorie-remaining').textContent='Loading…';$('calorie-percent').textContent='';$('recent-food').textContent='';}
  syncDate();useTargets(null);$('fitness-goals-form').querySelector('[type=submit]').disabled=true;
  return {syncDate,drawNutrition,useTargets,loadFitness,clearDay};
}
