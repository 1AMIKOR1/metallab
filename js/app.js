/* Offline learning interface. All production examples use fictional rules. */
(function () {
  'use strict';
  const D = window.SimData, E = window.SimEngine;
  const STORE_KEY = 'metallab.training.v2';
  const LEGACY_KEY = 'metallab.training.v1';
  const VIEWS = ['operator','regulation','workshop','practice','logic','revision','production','architecture','results','teacher'];
  const VIEW_TITLES = {operator:'Пульт оператора',regulation:'Технологический регламент',workshop:'Мастерская требований',practice:'Практические задания',logic:'Лаборатория тестирования',revision:'Регламент изменился',production:'Производственные кейсы',architecture:'Диагностика данных',results:'Мои результаты',teacher:'Кабинет преподавателя'};
  const testDefaults = {checkMissing:true,checkQuality:true,checkFreshness:false,inclusiveBounds:false};
  const params = new URLSearchParams(location.search);
  let storageError = '', storageBlocked = false;
  function readStorage(key) {
    try {
      const text = window.localStorage.getItem(key);
      if (text === null) return null;
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid session object');
      return value;
    } catch (error) {
      storageError = 'Не удалось прочитать сохранённую работу. Автосохранение приостановлено, чтобы не перезаписать исходные данные. Скачайте текущий отчёт.';
      storageBlocked = true;
      console.error('Session read failed', {operation:'readSession',key,error:error.message});
      return null;
    }
  }
  const saved = readStorage(STORE_KEY), legacy = saved?.legacyProgress || readStorage(LEGACY_KEY);
  const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
  function loadProgress(value) {
    const p = isRecord(value) ? value : {};
    return {cases:isRecord(p.cases)?JSON.parse(JSON.stringify(p.cases)):{},quiz:isRecord(p.quiz)?JSON.parse(JSON.stringify(p.quiz)):{},logicBest:Number.isFinite(p.logicBest)?Math.max(0,Math.min(10,p.logicBest)):0,name:typeof p.name==='string'?p.name.slice(0,80):''};
  }
  const freshTraining = () => ({workspaces:{},order:['range','quality','missing','freshness'],orderResult:null,defectResults:{},revision:{max:1140,maxAge:10,requirements:[],tests:[]},production:{},diagnostics:{},alarm:{active:false,acknowledged:true},logicBest:{},operatorDraft:{}});
  let training = freshTraining();
  if (saved) {
    if (saved.schemaVersion !== 2 || !validTraining(saved.training)) {
      storageError = 'Сохранённая сессия имеет неподдерживаемый формат. Исходные данные сохранены; автосохранение приостановлено.'; storageBlocked = true;
    } else training = saved.training;
  }
  function validTraining(t) {
    if (!isRecord(t) || !['workspaces','defectResults','revision','production','diagnostics','alarm','logicBest'].every(key=>isRecord(t[key]))) return false;
    if (!Array.isArray(t.order) || t.order.length!==4 || new Set(t.order).size!==4 || !t.order.every(id=>D.checkSteps.some(s=>s.id===id))) return false;
    if (!Array.isArray(t.revision.tests) || !Array.isArray(t.revision.requirements)) return false;
    if (!['defectResults','production','diagnostics'].every(key=>Object.values(t[key]).every(isRecord))) return false;
    return Object.values(t.workspaces).every(w=>isRecord(w) && D.productionCases.some(c=>c.id===w.caseId) && ['base',...Object.keys(D.regulations)].includes(w.rulesKey) && isRecord(w.parameter) && ['name','point','unit','reaction'].every(k=>typeof w.parameter[k]==='string') && Array.isArray(w.requirements) && w.requirements.length===4 && w.requirements.every(r=>isRecord(r)&&typeof r.text==='string'&&typeof r.source==='string') && Array.isArray(w.tests) && w.tests.length<=30 && w.tests.every(isRecord)) && t.revision.tests.every(isRecord);
  }
  const defaultLesson = {enabled:false,preset:35,segment:2,stage:0,remaining:720,timerRunning:false,projector:false};
  const lesson = {...defaultLesson};
  if (isRecord(saved?.lesson)) {
    for (const key of ['enabled','projector']) if (typeof saved.lesson[key] === 'boolean') lesson[key] = saved.lesson[key];
    if ([35,90].includes(saved.lesson.preset)) lesson.preset = saved.lesson.preset;
    if (Number.isInteger(saved.lesson.segment) && saved.lesson.segment >= 0 && saved.lesson.segment < D.lessonPresets[lesson.preset].length) lesson.segment = saved.lesson.segment;
    if (Number.isInteger(saved.lesson.stage) && saved.lesson.stage >= 0 && saved.lesson.stage < 4) lesson.stage = saved.lesson.stage;
    if (Number.isInteger(saved.lesson.remaining) && saved.lesson.remaining >= 0 && saved.lesson.remaining <= 5400) lesson.remaining = saved.lesson.remaining;
  }
  let sim = E.createScenario('overheat');
  if (saved?.sim && !storageBlocked) {
    try { sim = E.restoreSim(saved.sim); }
    catch (error) { storageError = 'Не удалось восстановить модель. Исходная сессия сохранена; автосохранение приостановлено.'; storageBlocked = true; console.error('Simulation restore failed',{operation:'restoreSimulation',error:error.message}); }
  }
  const explicitVariant = params.has('scenario') || params.has('rules');
  if (explicitVariant) {
    const key = ['base',...Object.keys(D.regulations)].includes(params.get('rules')) ? params.get('rules') : 'base';
    sim = E.createScenario(params.get('scenario') || 'overheat',key);
  }
  if (params.get('lesson') === '1') {
    lesson.enabled = true; lesson.stage = 0; lesson.projector = params.get('projector') === '1';
    lesson.preset = params.get('duration') === '90' ? 90 : 35; lesson.segment = 0;
    lesson.remaining = D.lessonPresets[lesson.preset][0].minutes*60;
  }
  if(params.get('projector')==='1') lesson.projector=true;
  if(['35','90'].includes(params.get('duration')) && params.get('lesson')!=='1'){lesson.preset=Number(params.get('duration'));lesson.segment=0;lesson.remaining=D.lessonPresets[lesson.preset][0].minutes*60;}
  const state = {
    view:VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'operator', sim,
    caseIndex:0,quizIndex:0,practiceTab:'cases',selectedReq:'FR-02',selectedArch:'gateway',
    logicOptions:{...testDefaults},logicResults:null,selectedDefect:'bounds',selectedDiagnostic:'loss',
    workshopCase:D.productionCases.some(c=>c.id===params.get('case')) ? params.get('case') : (D.productionCases.some(c=>c.id===saved?.workshopCase)?saved.workshopCase:'heating'),
    workshopRevision:saved?.workshopRevision === 'revision' ? 'revision' : 'base',
    pr1PreviousContext:isRecord(saved?.pr1PreviousContext) ? saved.pr1PreviousContext : null,
    progress:loadProgress(saved?.progress || legacy),legacyProgress:legacy ? loadProgress(legacy) : null,training,lesson
  };
  const ui = isRecord(saved?.ui) ? saved.ui : {};
  for (const [key,max] of [['caseIndex',9],['quizIndex',D.quiz.length-1]]) if (Number.isInteger(ui[key]) && ui[key]>=0 && ui[key]<=max) state[key]=ui[key];
  if (['cases','quiz'].includes(ui.practiceTab)) state.practiceTab=ui.practiceTab;
  if (D.defects.some(d=>d.id===ui.selectedDefect)) state.selectedDefect=ui.selectedDefect;
  if (D.diagnostics.some(d=>d.id===ui.selectedDiagnostic)) state.selectedDiagnostic=ui.selectedDiagnostic;
  for (const key of Object.keys(testDefaults)) if (typeof ui.logicOptions?.[key]==='boolean') state.logicOptions[key]=ui.logicOptions[key];
  if (!state.sim.events.length) E.addEvent(state.sim,'Сценарий','Открыта учебная модель');
  const $ = (selector) => document.querySelector(selector);
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function icon(id,cls=''){return `<svg class="ico ${cls}" aria-hidden="true"><use href="#ic-${id}"/></svg>`;}
  function fmt(v){return v===null || v===undefined || !Number.isFinite(v)?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1});}
  function hStatus(s){return D.statuses[s] || D.statuses.missing;}
  function tag(text,tone=''){return `<span class="tag ${tone}">${escapeHTML(text)}</span>`;}
  function card(content,extra=''){return `<section class="card ${extra}">${content}</section>`;}
  function sectionHead(title,sub='',right=''){return `<div class="section-head"><div><h2>${title}</h2>${sub?`<p>${sub}</p>`:''}</div>${right}</div>`;}
  function pageHead(label,title,description,actions=''){return `<div class="page-head"><div><span class="eyebrow">${label}</span><h1>${title}</h1><p>${description}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;}
  function button(label,action,cls='light',ico='',extra=''){return `<button type="button" class="btn ${cls}" data-action="${action}" ${extra}>${ico?icon(ico):''}${label}</button>`;}

  let toastTimer;
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('visible');
    window.clearTimeout(toastTimer); toastTimer = window.setTimeout(()=>el.classList.remove('visible'),3400);
  }
  function showStorageError() {
    const el = $('#saveWarning'); el.hidden = !storageError; el.textContent = storageError;
  }
  function persist() {
    if (storageBlocked) { showStorageError(); return false; }
    try {
      window.localStorage.setItem(STORE_KEY,JSON.stringify({schemaVersion:2,progress:state.progress,legacyProgress:state.legacyProgress,training:state.training,lesson:state.lesson,sim:state.sim,workshopCase:state.workshopCase,workshopRevision:state.workshopRevision,pr1PreviousContext:state.pr1PreviousContext,
        ui:{caseIndex:state.caseIndex,quizIndex:state.quizIndex,practiceTab:state.practiceTab,logicOptions:state.logicOptions,selectedDefect:state.selectedDefect,selectedDiagnostic:state.selectedDiagnostic}}));
      storageError = ''; showStorageError(); return true;
    } catch (error) {
      if (!storageError) console.error('Session save failed',{operation:'saveSession',error:error.message});
      storageError = 'Не удалось сохранить работу в браузере. Не закрывайте страницу: скачайте отчёт JSON в разделе «Мои результаты».';
      showStorageError(); return false;
    }
  }
  function savedToast(message) { if (persist()) toast(message); }
  function activeRules() { return E.rulesFor(state.sim.rulesKey); }
  function ruleName(rules = activeRules()) { return `${rules.id} v${rules.version}`; }
  function caseKey(item) { return state.sim.rulesKey === 'base' ? item.id : state.sim.rulesKey+':'+item.id; }
  function practiceCases() { return E.testsFor(activeRules()).map(c=>({...c,why:readingReason(c,activeRules())})); }
  function scenarioTitle() { return [...D.scenarios,...D.cycles].find(s=>s.id===state.sim.id)?.title || 'Ручная проверка'; }
  function navigate(view) {
    if (!VIEWS.includes(view)) return;
    state.view = view; if (location.hash.slice(1)!==view) location.hash = view;
    render(); $('#main').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'});
  }
  function setScenario(id,go = true) {
    if (![...D.scenarios,...D.cycles].some(s=>s.id===id)) return;
    const prior = state.sim, next = E.createScenario(id,state.sim.rulesKey === 'cycle' ? 'base' : state.sim.rulesKey);
    next.elapsed = prior.elapsed+1; next.history[0].t = next.elapsed; next.events = prior.events.slice();
    state.sim = next; state.logicResults = null;
    E.addEvent(next,'Сценарий',`Выбран сценарий «${scenarioTitle()}»`,'Преподаватель / студент');
    persist(); if (go) navigate('operator'); else render();
  }
  function setRules(key) {
    const rules = E.rulesFor(key), sim = state.sim;
    sim.running = false;
    if (sim.mode === 'cycle') { sim.id = 'manual'; sim.mode = 'manual'; }
    sim.rulesKey = key; sim.reading.sensorId = rules.sensorId; sim.holdSince = null; sim.holdElapsed = 0; sim.phase = '';
    sim.status = E.evaluate(sim.reading,rules); sim.previousStatus = sim.status;
    sim.history = [{t:sim.elapsed,v:sim.reading.value,quality:sim.reading.quality,status:sim.status}];
    state.logicResults = null; E.addEvent(sim,'Редакция регламента',`Выбрана ${ruleName(rules)}`,'Преподаватель / студент');
    persist(); render();
  }
  function readingReason(reading,rules) {
    const status = E.evaluate(reading,rules);
    if (status === 'missing') return 'Значение отсутствует; проверка диапазона не выполняется.';
    if (status === 'unreliable') return reading.quality !== 'Good' ? `Качество ${reading.quality}: данные нельзя использовать.` : `Возраст ${fmt(reading.age)} с; требуется от 0 до ${rules.maxAge} с.`;
    if (status === 'range') return `${fmt(reading.value)} ${rules.unit} вне диапазона ${rules.min}–${rules.max} ${rules.unit}.`;
    return `Значение в диапазоне ${rules.min}–${rules.max} ${rules.unit}, качество Good, возраст не больше ${rules.maxAge} с.`;
  }
  function ruleSelect(id = 'activeRules') {
    return `<label class="field compact-field" for="${id}">Учебный регламент<select id="${id}">${['base',...Object.keys(D.regulations)].map(key=>`<option value="${key}" ${state.sim.rulesKey===key?'selected':''}>${escapeHTML(ruleName(E.rulesFor(key)))}</option>`).join('')}</select></label>`;
  }
  function render() {
    document.body.classList.toggle('projector',state.lesson.projector && state.view==='operator');
    document.title = VIEW_TITLES[state.view]+' — МЕТАЛЛАБ'; $('#breadcrumbCurrent').textContent = VIEW_TITLES[state.view];
    document.querySelectorAll('[data-view]').forEach(b=>{const selected=b.dataset.view===state.view; b.classList.toggle('active',selected); if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    const views={operator:renderOperator,regulation:renderRegulation,workshop:renderWorkshop,practice:renderPractice,logic:renderLogic,revision:renderRevision,production:renderProduction,architecture:renderArchitecture,results:renderResults,teacher:renderTeacher};
    $('#main').innerHTML = views[state.view]();
    $('#regChip').textContent = ruleName(); showStorageError();
  }
  function redraw() { render(); }
  function refreshLive() {
    const focused = document.activeElement?.dataset.action;
    if (state.view === 'operator') {
      $('#operatorLive').innerHTML=operatorLive();
      $('#operatorEvents').innerHTML=solutionHidden()?'<p>Журнал скрыт до раскрытия ответа.</p>':renderEvents(state.sim.events,12);
    }
    if (state.view === 'architecture') $('#liveDataValue').textContent = JSON.stringify(E.dataValue(state.sim),null,2);
    if (focused && state.view === 'operator') document.querySelector(`[data-action="${focused}"]`)?.focus({preventScroll:true});
    document.querySelectorAll('[data-lesson-clock]').forEach(el=>el.textContent=timerText());
  }
  function timerText() { const n=state.lesson.remaining; return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'); }
  function lessonBar() {
    const lesson=state.lesson;
    if (!lesson.enabled && !lesson.projector) return `<div class="controls-row mb16">${ruleSelect()}${button('Режим занятия','lesson-enable')}${button('Для проектора','projector')}</div>`;
    return `<section class="lesson-bar" aria-label="Проведение занятия"><div><strong>${D.lessonStages[lesson.stage]}</strong><span class="small">${D.lessonPresets[lesson.preset][lesson.segment].title}</span></div><strong class="lesson-clock" data-lesson-clock role="timer">${timerText()}</strong><div class="controls-row">${button(lesson.timerRunning?'Пауза таймера':'Запустить таймер','timer-toggle')}${button('Этап →','lesson-stage')}${button(lesson.stage<2?'Показать ответ':'Скрыть ответ','lesson-reveal')}${button(lesson.projector?'Обычный экран':'Для проектора','projector')}${button('Настройки','open-teacher')}</div></section>`;
  }
  function solutionHidden() { return state.lesson.enabled && state.lesson.stage < 2; }
  function chartSVG(history,rules = activeRules()) {
    const W=730,H=210,L=55,R=15,T=15,B=30;
    const recent=history.slice(-60), values=recent.filter(p=>Number.isFinite(p.v)).map(p=>p.v);
    const lo=Math.min(rules.min-30,...values),hi=Math.max(rules.max+30,...values);
    const last=recent.at(-1)?.t || 0,span=Math.max(12,last-(recent[0]?.t || 0));
    const x=t=>L+(t-(last-span))/span*(W-L-R), y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
    const grid=[lo,rules.min,(rules.min+rules.max)/2,rules.max,hi].map(v=>`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#e5eaf0"/><text x="3" y="${y(v)+4}" font-size="11" fill="#66778a">${fmt(v)}</text>`).join('');
    const paths=E.historySegments(recent).map(s=>{
      const color=s.reliable?'#c96f29':'#69788a';
      const points=s.points.map(p=>`${x(p.t)},${y(p.v)}`).join(' ');
      return `${s.points.length>1?`<polyline data-quality="${s.reliable?'good':'unreliable'}" points="${points}" fill="none" stroke="${color}" stroke-width="3" ${s.reliable?'':'stroke-dasharray="5 4"'}/>`:''}${s.points.map(p=>`<circle cx="${x(p.t)}" cy="${y(p.v)}" r="2.5" fill="${color}"/>`).join('')}`;
    }).join('');
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="График T1, допуск ${rules.min}–${rules.max} ${rules.unit}. Серый пунктир — недостоверные данные, разрыв — отсутствие."><rect x="${L}" y="${y(rules.max)}" width="${W-L-R}" height="${y(rules.min)-y(rules.max)}" fill="#e2f5ed"/>${grid}${paths}<text x="${L}" y="204" font-size="11" fill="#66778a">${E.clockString(last-span)}</text><text x="${W-R}" y="204" text-anchor="end" font-size="11" fill="#66778a">${E.clockString(last)}</text></svg>`;
  }
  function operatorLive() {
    const sim=state.sim,r=sim.reading,rules=activeRules(),hidden=solutionHidden(),status=hStatus(sim.status);
    const decision=E.readiness(sim),decisionTone=decision==='Условия выполнены'?'good':sim.status==='ready'?'warn':status.tone;
    const measurementName=rules.holdSeconds && sim.status==='ready'?'В допуске':status.name;
    return `<div class="live-heading"><div><span class="eyebrow">${escapeHTML(scenarioTitle())}</span><span>${escapeHTML(ruleName())} · ${E.clockString(sim.elapsed)} · ${sim.running?'Запущено':'Пауза'}</span></div><div class="controls-row">${button(sim.running?'Пауза':'Запустить',sim.running?'pause':'play','primary')}${button('+1 секунда','step')}${button('+5 секунд','step-five')}${button('Сначала','reset')}</div></div>
      <div class="metric-grid">${card(`<div class="metric-label">Температура T1</div><div class="metric-value">${fmt(r.value)}<small>${rules.unit}</small></div><div class="metric-note">Допуск ${rules.min}–${rules.max} ${rules.unit}</div>`,'metric')}${card(`<div class="metric-label">Качество и возраст</div><div class="metric-value">${escapeHTML(r.quality)}<small>${fmt(r.age)} с</small></div><div class="metric-note">Предел ${rules.maxAge} с · ${escapeHTML(r.specimen)}</div>`,'metric')}${card(`<div class="metric-label">Информационный статус измерения</div><div class="metric-value">${hidden?'Ответ скрыт':measurementName}</div><div class="metric-note">${hidden?'Сначала обсудите условия':escapeHTML(readingReason(r,rules))}</div>`,'metric '+(hidden?'':'status '+status.tone))}</div>
      <div class="live-grid">${card(`<div class="card-pad">${sectionHead('Температура и достоверность',`Допуск ${rules.min}–${rules.max} ${rules.unit}`)}${chartSVG(sim.history,rules)}<p class="chart-caption">Оранжевый — достоверно · серый пунктир — недостоверно · разрыв — нет значения</p></div>`)}${card(`<div class="card-pad"><h2>Вопрос группе</h2><p class="live-question">Можно ли подтвердить выполнение условий? На какой пункт регламента вы опираетесь?</p>${sim.phase?`<p><strong>Этап:</strong> ${sim.phase}<br><strong>Выдержка:</strong> ${hidden?'скрыта':sim.holdElapsed+' / '+rules.holdSeconds+' с'}</p>`:''}<div class="status-panel ${hidden?'':decisionTone}"><strong>${hidden?'Решение появится на этапе «Ответ»':escapeHTML(decision)}</strong></div><p class="small">${hidden?'Преподаватель раскрывает ответ после обсуждения.':`Источник: ${E.sourceSeconds(sim)===null?'—':E.clockString(E.sourceSeconds(sim))}. Готовность процесса и качество данных проверяются отдельно.`}</p></div>`)}</div>`;
  }
  function renderOperator() {
    const r=state.sim.reading,draft=state.training.operatorDraft||{};
    return pageHead('УЧЕБНЫЙ УЧАСТОК','Пульт оператора','Все нормы условные. Сценарии воспроизводятся по учебному времени, связи с оборудованием нет.')+lessonBar()+`<div id="operatorLive">${operatorLive()}</div><div class="projector-extra grid2 mt20">${card(`<div class="card-pad">${sectionHead('Измерение вручную','Применение ставит модель на паузу')}<form id="manualForm"><div class="field-grid"><label class="field">Температура T1, °C<input name="manualTemp" type="number" step="0.1" min="-10000" max="10000" value="${r.value??1100}" required ${r.value===null?'disabled':''}></label><label class="field">Качество<select name="manualQuality">${['Good','Bad','Uncertain'].map(q=>`<option ${r.quality===q?'selected':''}>${q}</option>`).join('')}</select></label><label class="field">Возраст, с<input name="manualAge" type="number" min="0" max="300" step="1" value="${r.age??0}" required ${r.value===null?'disabled':''}></label><label class="checkbox-row"><input name="manualMissing" type="checkbox" ${r.value===null?'checked':''}>Нет значения</label></div><button class="btn primary mt15">Применить измерение</button></form><div class="controls-row mt15">${button('Норма','scenario-normal')}${button('Устаревание','scenario-stale')}${button('Неисправность','scenario-bad')}</div></div>`)}${card(`<div class="card-pad">${sectionHead('Решение оператора','Выберите действие, запишите основание')}<form id="operatorActionForm"><label class="field">Действие<select name="operatorAction"><option value="record" ${draft.action==='record'?'selected':''}>Зафиксировать отклонение</option><option value="master" ${draft.action==='master'?'selected':''}>Сообщить мастеру</option><option value="verify" ${draft.action==='verify'?'selected':''}>Запросить проверку измерения</option></select></label><label class="field mt10">Основание / пункт ТР<input name="operatorBasis" maxlength="200" value="${escapeHTML(draft.basis||'')}" required placeholder="Например, § 4"></label><label class="field mt10">Комментарий<textarea name="operatorComment" maxlength="1500" required>${escapeHTML(draft.comment||'')}</textarea></label><button class="btn primary mt15">Записать решение</button></form><p class="small mt10">Действия сохраняются для разбора преподавателем. Команд оборудованию нет.</p></div>`)}</div><div class="projector-extra mt20">${card(`<div class="card-pad">${sectionHead('Журнал учебной сессии','Сохраняется при перезагрузке',button('Скачать CSV','csv'))}<div id="operatorEvents">${solutionHidden()?'<p>Журнал скрыт до раскрытия ответа.</p>':renderEvents(state.sim.events,12)}</div></div>`)}</div>`;
  }
  function renderEvents(events,limit=5){if(!events.length)return `<div class="empty-message">Событий пока нет. Запустите сценарий или сделайте запись.</div>`;
    return `<div class="event-list">${events.slice(0,limit).map(e=>`<div class="event"><div class="event-time">${escapeHTML(e.time)}</div><div><div class="event-name">${escapeHTML(e.type)}</div><div class="event-meta">${escapeHTML(e.note)}</div></div></div>`).join('')}</div>`;}

  function getCaseEntry(c){return state.progress.cases[caseKey(c)] || {selected:'',attempts:0,solved:false,points:0};}
  function getQuizEntry(q){return state.progress.quiz[q.id] || {selected:'',attempts:0,solved:false,points:0};}
  function progressStats(){const cases=practiceCases().reduce((a,c)=>a+(state.progress.cases[caseKey(c)]?.points||0),0);const quiz=D.quiz.reduce((a,q)=>a+(state.progress.quiz[q.id]?.points||0),0);const logic=state.training.logicBest[state.sim.rulesKey] || 0;return {cases,quiz,logic,total:cases+quiz,max:practiceCases().length*2+D.quiz.length,solvedCases:practiceCases().filter(c=>state.progress.cases[caseKey(c)]?.solved).length,solvedQuiz:D.quiz.filter(q=>state.progress.quiz[q.id]?.solved).length};}

  function renderPractice(){const tabs=`<div class="mode-tabs"><button class="mode-tab ${state.practiceTab==='cases'?'selected':''}" type="button" data-action="tab-cases">Производственные ситуации</button><button class="mode-tab ${state.practiceTab==='quiz'?'selected':''}" type="button" data-action="tab-quiz">Мини-тест</button></div>`;const current=state.practiceTab==='cases'?practiceCases()[state.caseIndex]:D.quiz[state.quizIndex];const index=state.practiceTab==='cases'?state.caseIndex:state.quizIndex;const len=state.practiceTab==='cases'?practiceCases().length:D.quiz.length;const entry=state.practiceTab==='cases'?getCaseEntry(current):getQuizEntry(current);
    const isCase=state.practiceTab==='cases';const expected=isCase?current.answer:String(current.correct);
    const choices=isCase?Object.entries(D.statuses).map(([k,s])=>({id:k,label:s.name})):current.choices.map((label,i)=>({id:String(i),label}));
    const feedback=entry.attempts>0?`<div class="answer-box ${entry.solved?'correct':'wrong'}"><strong>${entry.solved?'Правильно!':'Пока не совпало с регламентом.'}</strong><div>${escapeHTML(entry.solved?(current.why):'Проверьте все условия по порядку: наличие → качество → свежесть → диапазон.')}</div>${entry.solved?`<div class="mt10"><strong>Начислено: ${entry.points} ${entry.points===1?'балл':'балла'}</strong></div>`:''}</div>`:'';
    const questionHtml=isCase?`<div class="task-info"><div class="task-fact"><label>Температура T1</label><strong>${fmt(current.value)} °C</strong></div><div class="task-fact"><label>Качество данных</label><strong>${current.quality}</strong></div><div class="task-fact"><label>Возраст</label><strong>${current.age===null?'—':current.age+' с'}</strong></div></div><h2>Какой информационный статус должен показать интерфейс?</h2>`:`<h2 style="font-size:20px;line-height:1.35;margin:15px 0 12px">${current.q}</h2>`;
    const completed=isCase?progressStats().solvedCases:progressStats().solvedQuiz;
    return pageHead('ПРАКТИКА · ПРОВЕРКА ТРЕБОВАНИЙ','Решайте производственные задачи',`Проверяйте поведение по ${activeRules().id} v${activeRules().version}: ${activeRules().min}–${activeRules().max} °C, возраст ≤ ${activeRules().maxAge} с. После ответа появится объяснение.`,tag(`${completed} из ${len} выполнено`,'good'))+
      `<div class="mb20">${tabs}</div><div class="task-layout"><section class="card task-card"><div class="section-head"><div><div class="task-counter">ЗАДАНИЕ ${index+1} ИЗ ${len} · ${isCase?current.id:current.id}</div></div>${tag(entry.solved?'Пройдено':'Ожидает решения',entry.solved?'good':'muted')}</div><div class="progress-track mb20"><div class="progress-bar" style="width:${(index+1)/len*100}%"></div></div>${questionHtml}<div class="choice-list" role="radiogroup" aria-label="Варианты ответа">${choices.map(c=>`<label class="choice"><input type="radio" name="taskChoice" value="${escapeHTML(c.id)}" ${entry.selected===c.id?'checked':''} ${entry.solved?'disabled':''}><span>${escapeHTML(c.label)}</span></label>`).join('')}</div>${feedback}<div class="controls-row">${button('Проверить ответ',isCase?'case-check':'quiz-check','primary','check',entry.solved?'disabled':'')}${button('Открыть регламент','open-regulation','light','book')}</div><div class="task-nav">${button('Предыдущее','task-prev','light','',index===0?'disabled':'')}<span class="muted small">${index+1} / ${len}</span>${button('Следующее','task-next','light','arrow',index===len-1?'disabled':'')}</div></section>
      <div class="stack">${card(`<div class="card-pad">${sectionHead('Ваш прогресс','Оценка сохраняется на этом устройстве')}
       <div class="score-number">${isCase?progressStats().cases:progressStats().quiz}<small> / ${isCase?practiceCases().length*2:D.quiz.length}</small></div><div class="mt10 progress-track"><div class="progress-bar" style="width:${(isCase?progressStats().cases/(practiceCases().length*2):progressStats().quiz/D.quiz.length)*100}%"></div></div><div class="mt20">${button('Все результаты','open-results','light','chart','style="width:100%"')}</div></div>`)}
       ${card(`<div class="card-pad">${sectionHead('Как рассуждать','Порядок проверки имеет значение')}<ol class="tip-list"><li>Есть ли значение T1?</li><li>Качество данных Good?</li><li>Возраст не более ${activeRules().maxAge} секунд?</li><li>Температура в диапазоне с включёнными границами?</li></ol></div>`)}
       ${card(`<div class="card-pad">${sectionHead('Правила начисления','Тренировка без ограничения времени')}<p class="small mb0">${isCase?'2 балла за верный ответ с первой попытки, 1 балл — после ошибки.':'1 балл за верный ответ независимо от числа попыток.'} Неверные ответы можно исправить; прогресс сохраняется локально.</p></div>`)}</div></div>`;
  }


  function requirementsFor(rules) {
    return [
      {id:'FR-01',source:'§ 1, § 4',title:'Отображение',text:`Показывать ID партии и датчика, T1 в ${rules.unit}, время источника, качество и возраст.`},
      {id:'FR-02',source:'§ 2, § 3',title:'Условия соответствия',text:`Подтверждать соответствие измерения только при ${rules.min} ≤ T1 ≤ ${rules.max} ${rules.unit}, Good, наличии значения и возрасте 0–${rules.maxAge} с.`},
      {id:'FR-03',source:'§ 3, § 4',title:'Отклонения',text:`Различать отсутствие, недостоверность и выход за ${rules.min}–${rules.max} ${rules.unit}; при возрасте больше ${rules.maxAge} с не подтверждать соответствие.`},
      {id:'FR-04',source:'§ 5',title:'Журнал',text:'Фиксировать исходные данные, время, источник, редакцию документа, результат, действие и комментарий оператора.'}
    ];
  }
  function renderRegulation() {
    const rules=activeRules();
    return pageHead('ИСТОЧНИК ТРЕБОВАНИЙ','Технологический регламент','Демонстрационный документ. Числа нельзя переносить в производственные инструкции.')+ruleSelect()+
      `<div class="grid2 mt20">${card(`<div class="card-pad"><h2>${escapeHTML(ruleName())}</h2><article class="doc-block"><h3>§ 1. Область применения</h3><p>Учебная партия ${escapeHTML(rules.specimen)}, точка ${escapeHTML(rules.sensorId)}. Только информационная проверка.</p></article><article class="doc-block"><h3>§ 2. Допустимое значение</h3><div class="rule-mono">${rules.min} ≤ T1 ≤ ${rules.max} ${rules.unit}</div><p>Обе границы включены.</p></article><article class="doc-block"><h3>§ 3. Достоверность</h3><p>Значение присутствует, качество Good, возраст от 0 до ${rules.maxAge} с включительно.</p></article><article class="doc-block"><h3>§ 4. Реакция</h3><p>При выходе за диапазон сообщить мастеру. При отсутствии или недостоверности запросить проверку измерения. Показать причину и не подтверждать соответствие.</p></article><article class="doc-block"><h3>§ 5. Учёт</h3><p>Записать ID партии, датчик, значение, качество, возраст, обе временные метки, результат, версию ТР и ПО, основание и решение оператора.</p></article>${rules.holdSeconds?`<article class="doc-block"><h3>§ 6. Расширенное условие выдержки</h3><p>Нужно ${rules.holdSeconds} непрерывных секунд достоверной температуры в допуске на этапе выдержки; потеря достоверности или выход за допуск обнуляет выдержку. Партия должна совпадать. Это отдельный регламент, базовый ТР-УЧ-01 не меняется.</p></article>`:''}${['melting','casting','rolling'].includes(state.sim.rulesKey)?`<p class="side-note">Дополнительные условия по анализу, уровню, скорости и геометрии приведены в соответствующем производственном кейсе.</p>`:''}</div>`)}${card(`<div class="card-pad"><h2>Разобранный пример</h2><p>Сначала разберите пример, затем сформулируйте собственные требования в мастерской.</p>${requirementsFor(rules).map(req=>`<article class="doc-block"><span class="section-kicker">${req.id} ← ${req.source}</span><h3>${req.title}</h3><p>${escapeHTML(req.text)}</p></article>`).join('')}${button('Открыть мастерскую','open-workshop','primary')}<p class="small mt15">Уставка задаёт цель регулирования, допуск — область соответствия, предел защиты — отдельную утверждённую защитную функцию. Учебный диапазон не задаёт блокировку.</p></div>`)}</div>`;
  }
  function workshopContext() {
    const item=D.productionCases.find(c=>c.id===state.workshopCase);
    const key=item.id==='heating'?state.workshopRevision:item.rulesKey;
    return {item,key,rules:E.rulesFor(key),id:item.id+':'+key};
  }
  function blankTest() { return {value:null,quality:'Good',age:0,missing:false,expected:'ready',scope:'measurement',context:'original',requirement:'FR-02'}; }
  function workspace() {
    const c=workshopContext();
    if (!Object.hasOwn(state.training.workspaces,c.id)) state.training.workspaces[c.id]={caseId:c.item.id,rulesKey:c.key,parameter:{name:'',point:'',unit:'',min:null,max:null,maxAge:null,inclusive:false,checkMissing:false,checkQuality:false,checkFreshness:false,reaction:''},requirements:Array.from({length:4},()=>({source:'',text:''})),tests:Array.from({length:3},blankTest),checked:false};
    return state.training.workspaces[c.id];
  }
  function statusOptions(value,context = false) {
    const options=Object.entries(D.statuses).map(([id,s])=>[id,s.name]);
    if(context) options.push(['context','Не подтверждено: принадлежность данных']);
    return options.map(([id,title])=>`<option value="${id}" ${value===id?'selected':''}>${title}</option>`).join('');
  }
  function testRows(tests,prefix,context = false) {
    return `<div class="student-tests">${tests.map((t,i)=>`<fieldset class="student-test"><legend>Тест ${i+1}</legend><div class="test-input-grid"><label class="field" for="${prefix}-value-${i}">T1, °C<input id="${prefix}-value-${i}" name="testValue-${i}" type="number" step="0.1" min="-10000" max="10000" value="${escapeHTML(t.value??'')}" ${t.missing?'disabled':''}></label><label class="field" for="${prefix}-quality-${i}">Качество<select id="${prefix}-quality-${i}" name="testQuality-${i}">${['Good','Bad','Uncertain'].map(q=>`<option ${q===t.quality?'selected':''}>${q}</option>`).join('')}</select></label><label class="field" for="${prefix}-age-${i}">Возраст, с<input id="${prefix}-age-${i}" name="testAge-${i}" type="number" min="0" max="300" step="1" value="${escapeHTML(t.age??0)}" ${t.missing?'disabled':''}></label><label class="field" for="${prefix}-expected-${i}">Ожидаемый результат<select id="${prefix}-expected-${i}" name="testExpected-${i}">${statusOptions(t.expected,context)}</select></label><label class="checkbox-row"><input name="testMissing-${i}" type="checkbox" ${t.missing?'checked':''}>Нет значения</label>${prefix==='workshop'?`<label class="field">Связь с требованием<select name="testRequirement-${i}">${['FR-01','FR-02','FR-03','FR-04'].map(id=>`<option value="${id}" ${(t.requirement||'FR-02')===id?'selected':''}>${id}</option>`).join('')}</select></label>`:''}${context?`<label class="field">Что проверяем<select name="testScope-${i}"><option value="measurement" ${t.scope!=='process'?'selected':''}>Измерение T1</option><option value="process" ${t.scope==='process'?'selected':''}>Решение по всем параметрам</option></select></label><label class="field">Дополнительные данные<select name="testContext-${i}"><option value="original" ${t.context==='original'?'selected':''}>Как в кейсе</option><option value="matching" ${t.context==='matching'?'selected':''}>Принадлежность исправлена</option><option value="good" ${t.context==='good'?'selected':''}>Все дополнительные данные исправны</option></select></label>`:''}</div></fieldset>`).join('')}</div>`;
  }
  function renderWorkshop() {
    const {item,key,rules}=workshopContext(),work=workspace(),assessment=E.assessWorkshop(work,rules);
    const labels=['Название','Точка измерения','Единица','Нижняя граница','Верхняя граница','Максимальный возраст','Включение границ','Отсутствие значения','Качество','Свежесть','Реакция ПО'];
    return pageHead('ОТ ДОКУМЕНТА К ПРОВЕРКЕ','Мастерская требований','Заполните карточку, четыре требования и минимум три теста. Формулировки и обоснования разбирает преподаватель.')+
      `<div class="controls-row mb20"><label class="field">Учебный кейс<select id="workshopCase">${D.productionCases.map(c=>`<option value="${c.id}" ${c.id===item.id?'selected':''}>${c.title}</option>`).join('')}</select></label>${item.id==='heating'?`<label class="field">Редакция<select id="workshopRevision"><option value="base" ${key==='base'?'selected':''}>ТР-УЧ-01 v1.0</option><option value="revision" ${key==='revision'?'selected':''}>ТР-УЧ-01 v2.0</option></select></label>`:''}${tag(ruleName(rules),'brand')}</div>
      <div class="workshop-layout"><aside class="card card-pad workshop-source"><h2>Исходный документ</h2><p>${escapeHTML(item.fragment)}</p><div class="rule-mono">${rules.min} ≤ T1 ≤ ${rules.max} ${rules.unit}</div><p>Good · возраст ≤ ${rules.maxAge} с · границы включены</p><p><strong>Точка:</strong> ${escapeHTML(item.point)}</p><p class="small">Все параметры и условия учебные. Карточка относится к T1; дополнительные условия кейса включите в требования и тесты решения процесса.</p>${work.checked?`<div class="answer-box ${assessment.readyForReview?'correct':'wrong'}"><strong>${assessment.readyForReview?'Работа готова к разбору':'Есть незавершённые проверки'}</strong><p>Карточка: ${assessment.cardChecks.filter(Boolean).length}/${labels.length}. Требований с источником: ${assessment.completeRequirements}/4.</p>${assessment.cardChecks.some(v=>!v)?`<p>Проверьте: ${labels.filter((_,i)=>!assessment.cardChecks[i]).join(', ')}.</p>`:''}<p>Покрытие: граница ${assessment.coverage.boundary?'✓':'—'}, отсутствие ${assessment.coverage.missing?'✓':'—'}, устаревание ${assessment.coverage.stale?'✓':'—'}. ${item.extra.length?'Решение процесса: '+(assessment.processCovered?'✓':'нужен тест исходной ситуации'):''}</p><p>Содержание свободных формулировок ещё не оценено преподавателем.</p></div>`:''}</aside>
      <form id="workshopForm" class="stack"><section class="card card-pad"><h2>1. Карточка параметра</h2><div class="field-grid mt15">${[['name','Наименование'],['point','Точка измерения'],['unit','Единица']].map(([id,title])=>`<label class="field">${title}<input name="parameter-${id}" maxlength="200" value="${escapeHTML(work.parameter[id])}"></label>`).join('')}${[['min','Нижняя граница'],['max','Верхняя граница'],['maxAge','Предельный возраст, с']].map(([id,title])=>`<label class="field">${title}<input name="parameter-${id}" type="number" step="0.1" value="${escapeHTML(work.parameter[id]??'')}"></label>`).join('')}</div><div class="checks mt15">${[['inclusive','Обе границы включены'],['checkMissing','Проверять отсутствие'],['checkQuality','Требовать Good'],['checkFreshness','Проверять свежесть']].map(([id,title])=>`<label class="checkbox-row"><input name="parameter-${id}" type="checkbox" ${work.parameter[id]?'checked':''}>${title}</label>`).join('')}</div><label class="field mt15">Реакция ПО / действия человека<textarea name="parameter-reaction" maxlength="1500">${escapeHTML(work.parameter.reaction)}</textarea></label></section>
      <section class="card card-pad"><h2>2. Четыре требования</h2><p class="small">Каждое требование описывает наблюдаемое поведение и ссылается на пункт. Смысл текста оценивает преподаватель.</p>${work.requirements.map((r,i)=>`<div class="requirement-row"><label class="field">FR-0${i+1}: источник<select name="requirementSource-${i}"><option value="">Выберите пункт</option>${['1','2','3','4','5'].map(n=>`<option value="${n}" ${r.source===n?'selected':''}>§ ${n}</option>`).join('')}</select></label><label class="field">Требование к системе<textarea name="requirementText-${i}" maxlength="2000">${escapeHTML(r.text)}</textarea></label></div>`).join('')}</section>
      <section class="card card-pad"><h2>3. Собственные тесты</h2><p class="small">Нужны хотя бы один тест границы, один отсутствия и один устаревания. Для переделов добавьте тест решения по всем параметрам.</p>${testRows(work.tests,'workshop',item.extra.length>0)}<div class="controls-row mt15">${button('Добавить тест','test-add')}<button class="btn primary">Проверить работу</button></div>${work.checked?`<ul class="test-feedback">${assessment.results.map((r,i)=>`<li>TEST-${i+1} → ${escapeHTML(work.tests[i].requirement||'FR-02')}: ${!r.valid?'Заполните допустимые входные данные':r.ok?'Ожидание совпало':'Ожидание не совпало с регламентом'}</li>`).join('')}</ul>`:''}</section></form></div>`;
  }
  function candidateCode() {
    const c=state.logicOptions,r=activeRules(),lines=[];
    if(c.checkMissing)lines.push('if (value == null || !isFinite(value)) return \"Нет данных\";');
    if(c.checkQuality)lines.push('if (quality != \"Good\") return \"Недостоверно\";');
    if(c.checkFreshness)lines.push(`if (!isFinite(age) || age < 0 || age > ${r.maxAge}) return \"Недостоверно\";`);
    lines.push(`if (T1 ${c.inclusiveBounds?'>=':'>'} ${r.min} && T1 ${c.inclusiveBounds?'<=':'<'} ${r.max}) return \"Готова\";`);
    lines.push('return \"Вне диапазона\";');return lines.join('\n');
  }
  function renderLogic() {
    const rules=activeRules(),tests=E.testsFor(rules),passed=state.logicResults?.filter(t=>t.ok).length || 0;
    const defect=D.defects.find(d=>d.id===state.selectedDefect),saved=state.training.defectResults[state.sim.rulesKey+':'+defect.id] || {};
    const order=state.training.order;
    return pageHead('ПРОВЕРКА И ОБОСНОВАНИЕ','Лаборатория тестирования','Готовые автотесты показывают исправность алгоритма. Самостоятельные находки учитываются отдельно.')+ruleSelect()+
      `<div class="grid2 mt20">${card(`<div class="card-pad"><h2>Вводное упражнение</h2><div class="checks mt15">${[['checkMissing','Проверять наличие'],['checkQuality','Проверять Good'],['checkFreshness',`Возраст ≤ ${rules.maxAge} с`],['inclusiveBounds',`Включить ${rules.min} и ${rules.max} °C`]].map(([id,title])=>`<label class="checkbox-row"><input type="checkbox" data-logic-option="${id}" ${state.logicOptions[id]?'checked':''}>${title}</label>`).join('')}</div><pre class="code-panel">${escapeHTML(candidateCode())}</pre><div class="controls-row mt15">${button('Запустить автотесты','logic-run','primary')}${button('Сбросить условия','logic-reset')}</div><p>Пройдено ${passed}/${tests.length} (${Math.round(passed/tests.length*100)}%). Баллы за запуск готового набора не начисляются.</p>${state.logicResults?`<ul class="test-feedback">${state.logicResults.map(r=>`<li>${r.id}: ${r.ok?'✓':'✕'} · ${fmt(r.input.value)} °C · ${r.input.quality} · ${fmt(r.input.age)} с → ${hStatus(r.actual).name}, ожидается ${hStatus(r.expected).name}</li>`).join('')}</ul>`:''}</div>`)}
      ${card(`<div class="card-pad"><h2>Порядок проверок</h2><p class="small">Сначала отсутствие, затем достоверность, в конце диапазон. Качество и свежесть можно проверять в любом порядке.</p><ol class="order-list">${order.map((id,i)=>`<li data-step="${id}" tabindex="-1"><span>${D.checkSteps.find(s=>s.id===id).title}</span><div><button type="button" class="btn light" data-move="${i}" data-direction="-1" aria-label="Поднять: ${D.checkSteps.find(s=>s.id===id).title}" ${i===0?'disabled':''}>↑</button><button type="button" class="btn light" data-move="${i}" data-direction="1" aria-label="Опустить: ${D.checkSteps.find(s=>s.id===id).title}" ${i===3?'disabled':''}>↓</button></div></li>`).join('')}</ol>${button('Проверить порядок','order-check','primary')}${state.training.orderResult!==null?`<p role="status">${state.training.orderResult?'✓ Порядок корректен':'Порядок пока не обеспечивает нужный приоритет проверок.'}</p>`:''}</div>`)}</div>
      <section class="card card-pad mt20"><h2>Найдите дефект и докажите его тестом</h2><label class="field mt15">Вариант алгоритма<select id="selectedDefect">${D.defects.map(d=>`<option value="${d.id}" ${d.id===defect.id?'selected':''}>${d.title}</option>`).join('')}</select></label><pre class="code-panel">${escapeHTML(defect.code)}</pre><p class="small">Остальные проверки присутствуют и корректны. В варианте B проверка свежести заменена указанным сравнением.</p><form id="defectForm"><label class="field">Какой дефект найден?<select name="defectAnswer"><option value="">Выберите</option>${[['bounds','Границы исключены'],['age','Сравнение возраста перевёрнуто'],['quality','Пропущено качество']].map(([id,title])=>`<option value="${id}" ${saved.answer===id?'selected':''}>${title}</option>`).join('')}</select></label>${testRows([saved.test||blankTest()],'defect')}<label class="field mt15">Почему этот тест обнаруживает ошибку? Почему середина диапазона не проверяет включение границ?<textarea name="defectExplanation" maxlength="2000" required>${escapeHTML(saved.explanation||'')}</textarea></label><button class="btn primary mt15">Проверить доказательство</button>${saved.checked?`<div class="answer-box ${saved.solved?'correct':'wrong'} mt15"><strong>${saved.solved?'Дефект подтверждён тестом':'Доказательство пока не получено'}</strong><p>${saved.solved?escapeHTML(defect.reason):'Укажите дефект, корректное ожидание по регламенту и вход, на котором ошибочный алгоритм даёт другой результат.'}</p><p>Попыток: ${saved.attempts}. Объяснение сохранено для преподавателя.</p></div>`:''}</form></section>`;
  }
  function revisionTests() {
    const r=state.training.revision;
    if (!r.tests.length) r.tests=[{value:1130,quality:'Good',age:5,expected:'ready'},{value:1135,quality:'Good',age:3,expected:'ready'},{value:1100,quality:'Good',age:6,expected:'ready'}];
    return r.tests;
  }
  function renderRevision() {
    const work=state.training.revision,tests=revisionTests(),check=E.checkRevision(work),rules=E.rulesFor('revision');
    return pageHead('УПРАВЛЕНИЕ ИЗМЕНЕНИЯМИ','Регламент изменился','Найдите затронутые требования, обновите правила алгоритма и ожидаемые результаты тестов.')+
      `<div class="grid2">${[E.rulesFor('base'),rules].map(r=>card(`<div class="card-pad"><h2>${ruleName(r)}</h2><p>§ 2: ${r.min} ≤ T1 ≤ ${r.max} °C включительно</p><p>§ 3: Good, значение присутствует, возраст ≤ ${r.maxAge} с</p><p class="small">§ 1, § 4 и § 5 сохраняют назначение.</p></div>`)).join('')}</div><form id="revisionForm" class="stack mt20"><section class="card card-pad"><h2>Затронутые требования</h2><div class="checks mt15">${requirementsFor(D.rules).map(r=>`<label class="checkbox-row"><input name="changedRequirement" type="checkbox" value="${r.id}" ${work.requirements.includes(r.id)?'checked':''}>${r.id} · ${r.title}</label>`).join('')}</div><h3 class="mt20">Обновите настройки алгоритма</h3><div class="field-grid"><label class="field">Верхняя граница, °C<input name="revisionMax" type="number" value="${escapeHTML(work.max)}" required></label><label class="field">Предельный возраст, с<input name="revisionMaxAge" type="number" value="${escapeHTML(work.maxAge)}" required></label></div></section><section class="card card-pad"><h2>Обновите три теста</h2><p>Проверьте новую границу, значение между старой и новой границами и возраст между старым и новым пределами.</p>${testRows(tests,'revision')}<label class="field mt15">Обоснование изменений<textarea name="revisionExplanation" maxlength="2000" required>${escapeHTML(work.explanation||'')}</textarea></label><button class="btn primary mt15">Проверить изменения</button></section></form>${work.checked?card(`<div class="card-pad mt20"><h2>${check.ok?'✓ Изменения проверены':'Проверьте цепочку изменений'}</h2><p>Требования: ${check.changed?'✓':'—'} · настройки: ${check.configured?'✓':'—'} · ожидания тестов: ${check.valid?'✓':'—'}</p><div class="table-scroll"><table class="test-table"><thead><tr><th>Источник</th><th>Требование</th><th>Проверка</th><th>Доказательство</th></tr></thead><tbody><tr><td>§ 2</td><td>FR-02</td><td>Новая верхняя граница</td><td>${check.bounds?'✓':'Нет теста'} · ${rules.max} °C</td></tr><tr><td>§ 2</td><td>FR-02 / FR-03</td><td>Старый допуск больше нового</td><td>${check.temperatureChanged?'✓':'Нет теста'}</td></tr><tr><td>§ 3</td><td>FR-02 / FR-03</td><td>Новый предел свежести</td><td>${check.freshnessChanged?'✓':'Нет теста'}</td></tr></tbody></table></div><p class="small">Обоснование ожидает разбора преподавателем.</p>${button('Применить редакцию 2.0 на пульте','apply-revision','primary')}</div>`):''}`;
  }

  function renderProduction() {
    const item=workshopContext().item,rules=E.rulesFor(item.rulesKey),answer=state.training.production[item.id] || {},alarm=state.training.alarm;
    return pageHead('ДАННЫЕ И ПРИНАДЛЕЖНОСТЬ','Производственные кейсы','Одинаковое число имеет разный смысл в зависимости от передела, партии и остальных измерений.')+
      `<div class="controls-row mb20">${D.productionCases.map(c=>`<button type="button" class="btn ${c.id===item.id?'primary':'light'}" data-production="${c.id}">${c.title}</button>`).join('')}</div><div class="grid2">${card(`<div class="card-pad"><h2>${item.title} · ${ruleName(rules)}</h2><p>${escapeHTML(item.fragment)}</p><div class="rule-mono">${rules.min} ≤ T1 ≤ ${rules.max} °C · Good · ≤ ${rules.maxAge} с</div><h3 class="mt20">Исходные данные</h3><p>T1 = ${item.reading.value} °C · ${item.reading.quality} · ${item.reading.age} с · партия ${rules.specimen}</p>${item.extra.map(r=>`<p><strong>${escapeHTML(r.name)}</strong>: ${escapeHTML(r.value)} ${escapeHTML(r.unit||'')} · ${r.quality} · ${r.age} с${r.batch?` · партия ${escapeHTML(r.batch)}`:''}</p>`).join('')}<p class="side-note">Это учебные исходные данные, не производственные нормы.</p></div>`)}${card(`<div class="card-pad"><h2>${escapeHTML(item.question)}</h2><form id="productionForm"><label class="field">Итог проверки<select name="productionAnswer">${statusOptions(answer.answer,true)}</select></label><label class="field mt15">Какие требования и тесты нужны?<textarea name="productionExplanation" maxlength="2000" required>${escapeHTML(answer.explanation||'')}</textarea></label><button class="btn primary mt15">Проверить решение</button></form>${answer.checked?`<div class="answer-box ${answer.solved?'correct':'wrong'} mt15"><strong>${answer.solved?'✓ Решение совпало':'Проверьте все условия'}</strong><p>${escapeHTML(item.reason)}</p><p>Попыток: ${answer.attempts}. Обоснование сохранено для разбора.</p></div>`:''}<div class="mt20">${button('Составить требования и тесты','open-workshop','primary')}</div></div>`)}</div>
      <section class="card card-pad mt20"><h2>Сообщение, тревога и блокировка</h2><div class="grid3 mt15"><div><h3>Сообщение</h3><p>Описывает состояние. Например, «Началась выдержка».</p></div><div><h3>Учебная тревога</h3><p>Требует реакции. Приоритет в упражнении — высокий, действие — сообщить мастеру. Квитирование отмечает прочтение.</p></div><div><h3>Блокировка</h3><p>Отдельная утверждённая функция защиты. В симуляторе не реализуется и не выводится из допуска температуры.</p></div></div><div class="status-panel"><strong>${alarm.active?'Причина тревоги активна':'Причины тревоги нет'} · ${alarm.acknowledged?'Квитирована':'Не квитирована'}</strong></div><div class="controls-row">${button('Вызвать учебную тревогу','alarm-raise')}${button('Квитировать','alarm-ack','light','',alarm.acknowledged?'disabled':'')}${button('Устранить учебную причину','alarm-clear','light','',!alarm.active?'disabled':'')}</div><p class="small mt15">Квитирование не изменяет температуру и не устраняет причину. Исчезновение причины также не означает, что оператор прочитал тревогу. Все переходы записываются в журнал.</p></section>`;
  }
  function renderArchitecture() {
    const d=D.diagnostics.find(d=>d.id===state.selectedDiagnostic),saved=state.training.diagnostics[d.id] || {};
    return pageHead('ОТ ИЗМЕРЕНИЯ К ИНТЕРФЕЙСУ','Диагностика данных','Определите место проблемы и сведения, необходимые для проверки гипотезы.')+
      `<div class="architecture-row">${D.architecture.map(n=>`<button type="button" class="architecture-item ${n.id===state.selectedArch?'selected':''}" data-arch="${n.id}"><small>${n.level}</small><strong>${n.title}</strong><span>${n.sub}</span></button>`).join('')}</div>${card(`<div class="card-pad"><h2>${D.architecture.find(n=>n.id===state.selectedArch).title}</h2><p>${D.architecture.find(n=>n.id===state.selectedArch).why}</p><pre id="liveDataValue" class="json-view">${escapeHTML(JSON.stringify(E.dataValue(state.sim),null,2))}</pre><p class="small">Имитация DataValue активной модели. StatusCode содержит учебную категорию качества, без сетевого стека OPC UA.</p></div>`)}
      <div class="grid2 mt20">${card(`<div class="card-pad"><h2>Диагностическая ситуация</h2><label class="field mt15">Сценарий<select id="selectedDiagnostic">${D.diagnostics.map(x=>`<option value="${x.id}" ${x.id===d.id?'selected':''}>${x.title}</option>`).join('')}</select></label><div class="statline"><span>Основной датчик</span><strong>${d.value} °C · ${d.quality}</strong></div><div class="statline"><span>Второй датчик</span><strong>${d.secondary} °C · Good</strong></div><div class="statline"><span>Время источника</span><strong>${E.isoClock(-d.sourceAge)}</strong></div><div class="statline"><span>Последний приём</span><strong>${E.isoClock(-d.receiveAge)}</strong></div><div class="statline"><span>Подтверждение связи</span><strong>${E.isoClock(-d.heartbeatAge)}</strong></div><p class="small">Момент наблюдения: ${E.isoClock(0)}. Эти данные отдельного упражнения не меняются при запуске пульта.</p></div>`)}${card(`<div class="card-pad"><h2>Ваша гипотеза</h2><form id="diagnosticForm"><label class="field">Где искать проблему?<select name="diagnosticLocation"><option value="">Выберите</option><option value="field" ${saved.location==='field'?'selected':''}>Измерение / датчики</option><option value="gateway" ${saved.location==='gateway'?'selected':''}>Передача / приём данных</option><option value="none" ${saved.location==='none'?'selected':''}>Текущий сбой не подтверждён</option></select></label><label class="field mt15">Какие сведения нужны?<select name="diagnosticMissing"><option value="">Выберите</option>${[['state','Состояние связи и контроллера'],['queue','Очередь и задержка доставки'],['history','Журнал восстановления потока'],['calibration','Условия измерения и калибровка'],['contract','Правила обновления и подтверждения актуальности']].map(([id,title])=>`<option value="${id}" ${saved.missing===id?'selected':''}>${title}</option>`).join('')}</select></label><label class="field mt15">Обоснование<textarea name="diagnosticExplanation" maxlength="2000" required>${escapeHTML(saved.explanation||'')}</textarea></label><button class="btn primary mt15">Проверить гипотезу</button></form>${saved.checked?`<div class="answer-box ${saved.solved?'correct':'wrong'} mt15"><strong>${saved.solved?'✓ Гипотеза подтверждена':'Проверьте гипотезу'}</strong><p>${escapeHTML(d.why)}</p><p>Обоснование ожидает разбора преподавателем.</p></div>`:''}</div>`)}</div><p class="side-note mt20">Постоянное число не доказывает зависание. При передаче по изменениям надо различать время изменения источника, время приёма и подтверждение актуальности. Учебный ТР-УЧ-01 отдельно задаёт проверку возраста измерения.</p>`;
  }
  function newAchievements() {
    const t=state.training;
    return {order:t.orderResult===true,defects:Object.values(t.defectResults).filter(x=>x.solved).length,
      revision:t.revision.checked && E.checkRevision(t.revision).ok,
      production:Object.values(t.production).filter(x=>x.solved).length,diagnostics:Object.values(t.diagnostics).filter(x=>x.solved).length,
      workshops:Object.entries(t.workspaces).filter(([,w])=>w.checked && E.assessWorkshop(w,E.rulesFor(w.rulesKey)).readyForReview).length};
  }
  function renderResults() {
    const st=progressStats(),a=newAchievements(),old=state.legacyProgress;
    const oldCases=old?D.cases.reduce((sum,c)=>sum+(old.cases[c.id]?.points||0),0):0;
    const oldQuiz=old?D.quiz.reduce((sum,q)=>sum+(old.quiz[q.id]?.points||0),0):0;
    return pageHead('СОХРАНЕНИЕ И РАЗБОР','Мои результаты','Автопроверка подтверждает структурированные действия. Смысл требований и объяснений оценивает преподаватель.')+
      `<div class="grid3">${card(`<div class="card-pad"><h2>Вводные упражнения</h2><div class="score-number mt15">${st.total}<small> / ${st.max}</small></div><p>${ruleName()}: ситуации ${st.cases}/20, мини-тест ${st.quiz}/6. Готовые автотесты не входят в баллы.</p></div>`)}${card(`<div class="card-pad"><h2>Самостоятельная практика</h2><p>Порядок: ${a.order?'✓':'—'} · дефекты: ${a.defects}</p><p>Редакция: ${a.revision?'✓':'—'} · кейсы: ${a.production}/4 · диагностика: ${a.diagnostics}/5</p><p>Работ готовы к разбору: ${a.workshops}. Свободные тексты ожидают оценки.</p></div>`)}${card(`<div class="card-pad"><h2>Архив версии 1</h2>${old?`<div class="score-number mt15">${oldCases+oldQuiz+old.logicBest}<small> / 36</small></div><p>Исходные результаты сохранены отдельно. Отладка v1: ${old.logicBest}/10.</p>`:'<p>Результатов прежней версии в этом браузере нет.</p>'}</div>`)}</div>
      <section class="card card-pad mt20"><h2>Передать работу преподавателю</h2><form id="nameForm"><label class="field mt15">Имя / группа (необязательно)<input name="studentName" maxlength="80" value="${escapeHTML(state.progress.name)}"></label><button class="btn light mt15">Сохранить подпись</button></form><div class="controls-row mt20">${button('Скачать отчёт JSON','json','primary')}${button('Скачать журнал CSV','csv')}${button('Печать','print')}${button('Начать новую работу','clear-results','danger','',storageBlocked?'disabled':'')}</div><p class="small mt15">Отчёт включает требования, собственные тесты, попытки, обоснования, редакции ТР, достижения, журнал и исходные результаты v1. Он хранится локально и может быть отредактирован владельцем; самостоятельность выполнения не подтверждается.</p></section>`;
  }
  function renderTeacher() {
    const lesson=state.lesson,segments=D.lessonPresets[lesson.preset];
    return pageHead('ПРОВЕДЕНИЕ ЗАНЯТИЯ','Кабинет преподавателя','Настройте этапы показа и самостоятельной работы. На каждом компьютере своя сессия.')+
      `<section class="card card-pad"><div class="grid2"><div><h2>План занятия</h2><label class="field mt15">Продолжительность<select id="lessonPreset"><option value="35" ${lesson.preset===35?'selected':''}>35 минут</option><option value="90" ${lesson.preset===90?'selected':''}>90 минут</option></select></label><label class="field mt15">Текущий отрезок<select id="lessonSegment">${segments.map((s,i)=>`<option value="${i}" ${i===lesson.segment?'selected':''}>${s.minutes} мин · ${s.title}</option>`).join('')}</select></label><p class="small">35 минут интерактивной работы можно включить в 90-минутный урок. Выбор отрезка задаёт его таймер.</p></div><div><h2>Обсуждение и таймер</h2><div class="lesson-clock mt15" data-lesson-clock role="timer">${timerText()}</div><div class="controls-row mt15">${button(lesson.timerRunning?'Пауза таймера':'Запустить таймер','timer-toggle')}${button('Сбросить таймер','timer-reset')}${button(lesson.enabled?'Выключить этапы показа':'Включить этапы показа','lesson-enable')}</div><label class="field mt15">Этап показа<select id="lessonStage">${D.lessonStages.map((s,i)=>`<option value="${i}" ${i===lesson.stage?'selected':''}>${s}</option>`).join('')}</select></label><div class="controls-row mt15">${button('Открыть пульт','open-operator','primary')}${button(lesson.projector?'Обычный экран':'Экран для проектора','projector')}</div></div></div></section>
      <section class="card card-pad mt20"><h2>Сценарии демонстрации</h2><div class="scenario-grid mt15">${[...D.scenarios,...D.cycles].map(s=>`<button class="scenario-card" type="button" data-scenario="${s.id}"><strong>${s.title}</strong><small>${s.subtitle || 'Загрузка → нагрев → выдержка → передача'}</small><span class="small">${s.variant?'ТР-УЧ-02 · выдержка 5 с':ruleName()}</span></button>`).join('')}</div></section>
      <section class="card card-pad mt20"><h2>Ссылка на учебный вариант</h2><p>Ссылка задаёт сценарий, редакцию, длительность, режим показа и выбранный кейс. Результаты и журнал в ссылку не включаются.</p><label class="field">Адрес для студентов<input id="variantLink" type="text" readonly value="${escapeHTML(variantLink())}"></label><div class="controls-row mt15">${button('Выделить ссылку','select-link')}${button('Скачать ссылку','download-link')}</div><p class="small">Каждый компьютер проходит вариант независимо. Синхронизации экранов и сервера сбора ответов нет.</p>${['127.0.0.1','localhost'].includes(new URL(location.href).hostname)?'<p class="side-note">Это локальный адрес: он работает только на этом компьютере. Для группы откройте опубликованный сайт и создайте ссылку там.</p>':''}</section>
      <section class="card card-pad mt20"><h2>Последовательность работы</h2><ol class="tip-list"><li>Показать ситуацию без готового решения и собрать версии группы.</li><li>Открыть регламент, выделить условия и источники данных.</li><li>В мастерской записать четыре требования и собственные тесты.</li><li>Проверить дефект или новую редакцию; объяснить последствия ошибки.</li><li>Раскрыть решение и разобрать исходные данные, обоснования и журнал.</li></ol><p class="small mt15">Выдержка 5 с и все допуски условны. Сценарии используют подготовленные временные ряды, не рассчитывают физику печи или себестоимость.</p></section>
      <section class="card card-pad mt20"><h2>Материалы</h2>${D.sources.map(s=>`<p>${s.url?`<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(s.name)}</a>`:escapeHTML(s.name)}<br><span class="small">${escapeHTML(s.desc)}</span></p>`).join('')}</section>`;
  }
  function variantLink() {
    const url=new URL(location.href); url.search=''; url.hash='operator';
    url.searchParams.set('scenario',state.sim.id==='manual'?'overheat':state.sim.id); url.searchParams.set('rules',state.sim.rulesKey);
    url.searchParams.set('case',state.workshopCase); url.searchParams.set('duration',String(state.lesson.preset));
    if(state.lesson.enabled)url.searchParams.set('lesson','1');
    if(state.lesson.projector)url.searchParams.set('projector','1');
    return url.href;
  }
  function csvString(rows){const cols=['timestamp','sourceTimestamp','appVersion','scenario','phase','holdElapsed','processDecision','type','specimen','sensorId','value','unit','quality','age','status','regulation','action','note'];const esc=v=>{let raw=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(raw))raw="'"+raw;return '"'+raw.replace(/"/g,'""')+'"';};return '\ufeff'+cols.join(';')+'\r\n'+rows.map(r=>cols.map(c=>esc(r[c])).join(';')).join('\r\n');}
  function downloadText(content,name,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1200);toast('Файл сформирован: '+name);}

  function reportPayload() {
    return {schemaVersion:2,app:'МЕТАЛЛАБ',version:D.version,exportedAt:new Date().toISOString(),student:state.progress.name||'Не указано',
      rules:activeRules(),scenario:{id:state.sim.id,elapsed:state.sim.elapsed,phase:state.sim.phase,holdElapsed:state.sim.holdElapsed},
      progress:state.progress,legacyProgress:state.legacyProgress,stats:progressStats(),achievements:newAchievements(),training:state.training,
      workshopReports:Object.entries(state.training.workspaces).map(([id,w])=>({id,caseId:w.caseId,regulation:E.rulesFor(w.rulesKey),requirements:w.requirements,tests:w.tests,assessment:E.assessWorkshop(w,E.rulesFor(w.rulesKey)),trace:w.tests.map((test,i)=>({testId:'TEST-'+(i+1),requirementId:test.requirement||'FR-02',source:w.requirements[Number((test.requirement||'FR-02').slice(-1))-1]?.source||''})),review:'Свободные формулировки требуют оценки преподавателем'})),
      revisionTrace:E.checkRevision(state.training.revision),lesson:state.lesson,events:state.sim.events,note:'Все нормы учебные. Локальный отчёт не подтверждает самостоятельность выполнения.'};
  }
  function exportJSON() { downloadText(JSON.stringify(reportPayload(),null,2),'metallab-report-v2.json','application/json;charset=utf-8'); }
  function exportCSV() { downloadText(csvString(state.sim.events),'metallab-events.csv','text/csv;charset=utf-8'); }
  function formNumber(form,name) { const value=form.get(name); return value===null || String(value).trim()==='' ? null : Number(value); }
  function collectTests(formElement) {
    const form=new FormData(formElement);
    return Array.from(formElement.querySelectorAll('.student-test'),(_,i)=>{
      const missing=form.has('testMissing-'+i);
      return {value:missing?null:formNumber(form,'testValue-'+i),quality:String(form.get('testQuality-'+i)),age:missing?null:formNumber(form,'testAge-'+i),missing,
        expected:String(form.get('testExpected-'+i)),scope:String(form.get('testScope-'+i)||'measurement'),context:String(form.get('testContext-'+i)||'original'),requirement:String(form.get('testRequirement-'+i)||'FR-02')};
    });
  }
  function captureDraft(formElement) {
    if (!formElement) return;
    const f=new FormData(formElement);
    if (formElement.id==='workshopForm') {
      const w=workspace();
      for(const id of ['name','point','unit','reaction']) w.parameter[id]=String(f.get('parameter-'+id)||'').slice(0,id==='reaction'?1500:200);
      for(const id of ['min','max','maxAge']) w.parameter[id]=formNumber(f,'parameter-'+id);
      for(const id of ['inclusive','checkMissing','checkQuality','checkFreshness']) w.parameter[id]=f.has('parameter-'+id);
      w.requirements=Array.from({length:4},(_,i)=>({source:String(f.get('requirementSource-'+i)||''),text:String(f.get('requirementText-'+i)||'').slice(0,2000)}));
      w.tests=collectTests(formElement); w.checked=false;
    } else if(formElement.id==='defectForm') {
      const key=state.sim.rulesKey+':'+state.selectedDefect, prior=state.training.defectResults[key] || {};
      state.training.defectResults[key]={...prior,answer:String(f.get('defectAnswer')||''),test:collectTests(formElement)[0],explanation:String(f.get('defectExplanation')||'').slice(0,2000),checked:false,solved:false};
    } else if(formElement.id==='revisionForm') {
      const w=state.training.revision;
      Object.assign(w,{max:formNumber(f,'revisionMax'),maxAge:formNumber(f,'revisionMaxAge'),requirements:f.getAll('changedRequirement'),tests:collectTests(formElement),explanation:String(f.get('revisionExplanation')||'').slice(0,2000),checked:false});
    } else if(formElement.id==='productionForm') {
      const key=state.workshopCase,prior=state.training.production[key] || {};
      state.training.production[key]={...prior,answer:String(f.get('productionAnswer')),explanation:String(f.get('productionExplanation')||'').slice(0,2000),checked:false,solved:false};
    } else if(formElement.id==='operatorActionForm') {
      state.training.operatorDraft={action:String(f.get('operatorAction')||''),basis:String(f.get('operatorBasis')||'').slice(0,200),comment:String(f.get('operatorComment')||'').slice(0,1500)};
    } else if(formElement.id==='diagnosticForm') {
      const key=state.selectedDiagnostic,prior=state.training.diagnostics[key] || {};
      state.training.diagnostics[key]={...prior,location:String(f.get('diagnosticLocation')),missing:String(f.get('diagnosticMissing')),explanation:String(f.get('diagnosticExplanation')||'').slice(0,2000),checked:false,solved:false};
    }
  }
  function checkPractice(kind) {
    const isCase=kind==='cases',item=isCase?practiceCases()[state.caseIndex]:D.quiz[state.quizIndex];
    const selected=document.querySelector('input[name="taskChoice"]:checked')?.value;
    if(selected===undefined){toast('Сначала выберите вариант ответа.');return;}
    const store=isCase?state.progress.cases:state.progress.quiz,key=isCase?caseKey(item):item.id;
    const entry=store[key]||{attempts:0,solved:false}; if(entry.solved)return;
    const correct=selected===(isCase?item.answer:String(item.correct)),attempts=entry.attempts+1;
    store[key]={selected,attempts,solved:correct,points:correct?(isCase?(attempts===1?2:1):1):0};
    persist();render();toast(correct?'Верно!':'Проверьте условия и попробуйте снова.');
  }
  function runLogic() {
    const rules=activeRules();
    state.logicResults=E.testsFor(rules).map(c=>{const actual=E.evaluateCandidate(c,state.logicOptions,rules);return {id:c.id,input:c,expected:c.answer,actual,ok:actual===c.answer};});
    state.training.logicBest[state.sim.rulesKey]=Math.max(state.training.logicBest[state.sim.rulesKey]||0,state.logicResults.filter(t=>t.ok).length);
    persist();render();
  }
  let lessonDeadline=null;
  document.addEventListener('input',event=>{captureDraft(event.target.closest('form'));persist();});
  document.addEventListener('change',event=>{
    const target=event.target;
    if(target.name==='manualMissing'){
      for(const name of ['manualTemp','manualAge'])target.closest('form').querySelector(`[name="${name}"]`).disabled=target.checked;
    }
    if(target.name?.startsWith('testMissing-')) {
      const index=target.name.split('-')[1],form=target.closest('form');
      for(const name of ['testValue-','testAge-'])form.querySelector(`[name="${name+index}"]`).disabled=target.checked;
    }
    captureDraft(target.closest('form'));
    const option=target.dataset.logicOption;
    if(option && Object.hasOwn(state.logicOptions,option)){state.logicOptions[option]=target.checked;state.logicResults=null;}
    if(target.id==='activeRules'){setRules(target.value);return;}
    if(target.id==='workshopCase')state.workshopCase=target.value;
    if(target.id==='workshopRevision')state.workshopRevision=target.value;
    if(target.id==='selectedDefect')state.selectedDefect=target.value;
    if(target.id==='selectedDiagnostic')state.selectedDiagnostic=target.value;
    if(target.id==='lessonStage'){state.lesson.stage=Number(target.value);state.lesson.enabled=true;}
    if(target.id==='lessonPreset'){state.lesson.preset=Number(target.value);state.lesson.segment=0;}
    if(target.id==='lessonSegment')state.lesson.segment=Number(target.value);
    if(['lessonPreset','lessonSegment'].includes(target.id)){state.lesson.remaining=D.lessonPresets[state.lesson.preset][state.lesson.segment].minutes*60;state.lesson.timerRunning=false;lessonDeadline=null;}
    persist();
    if(option || ['workshopCase','workshopRevision','selectedDefect','selectedDiagnostic','lessonStage','lessonPreset','lessonSegment'].includes(target.id))render();
  });
  document.addEventListener('click',event=>{
    const target=event.target;
    const nav=target.closest('[data-view]');if(nav){navigate(nav.dataset.view);return;}
    const preset=target.closest('[data-scenario]');if(preset){setScenario(preset.dataset.scenario);return;}
    const arch=target.closest('[data-arch]');if(arch){state.selectedArch=arch.dataset.arch;render();return;}
    const production=target.closest('[data-production]');if(production){state.workshopCase=production.dataset.production;persist();render();return;}
    const move=target.closest('[data-move]');
    if(move){const i=Number(move.dataset.move),next=i+Number(move.dataset.direction),order=state.training.order;if(next<0||next>=order.length)return;[order[i],order[next]]=[order[next],order[i]];state.training.orderResult=null;persist();render();document.querySelector(`[data-step="${order[next]}"]`).focus({preventScroll:true});return;}
    const action=target.closest('[data-action]')?.dataset.action;
    if(!action)return;
    switch(action){
      case 'play':state.sim.running=true;E.addEvent(state.sim,'Модель','Учебное время запущено','Студент');break;
      case 'pause':state.sim.running=false;E.addEvent(state.sim,'Модель','Пауза','Студент');break;
      case 'step':case 'step-five':state.sim.running=false;for(let i=0;i<(action==='step'?1:5);i++)E.tick(state.sim);break;
      case 'reset':setScenario(state.sim.id==='manual'?'overheat':state.sim.id,false);return;
      case 'scenario-normal':case 'scenario-stale':case 'scenario-bad':setScenario(action.slice(9),false);return;
      case 'open-operator':navigate('operator');return;
      case 'open-teacher':navigate('teacher');return;
      case 'open-regulation':navigate('regulation');return;
      case 'open-workshop':navigate('workshop');return;
      case 'open-results':navigate('results');return;
      case 'open-practice':navigate('practice');return;
      case 'tab-cases':state.practiceTab='cases';break;
      case 'tab-quiz':state.practiceTab='quiz';break;
      case 'case-check':checkPractice('cases');return;
      case 'quiz-check':checkPractice('quiz');return;
      case 'task-prev':if(state.practiceTab==='cases')state.caseIndex=Math.max(0,state.caseIndex-1);else state.quizIndex=Math.max(0,state.quizIndex-1);break;
      case 'task-next':if(state.practiceTab==='cases')state.caseIndex=Math.min(9,state.caseIndex+1);else state.quizIndex=Math.min(D.quiz.length-1,state.quizIndex+1);break;
      case 'logic-run':runLogic();return;
      case 'logic-reset':state.logicOptions={...testDefaults};state.logicResults=null;break;
      case 'order-check':state.training.orderResult=E.correctOrder(state.training.order);break;
      case 'test-add':captureDraft($('#workshopForm'));if(workspace().tests.length>=30){toast('Не больше 30 тестов в одной работе.');return;}workspace().tests.push(blankTest());break;
      case 'apply-revision':setRules('revision');navigate('operator');return;
      case 'lesson-enable':state.lesson.enabled=!state.lesson.enabled;break;
      case 'lesson-stage':state.lesson.enabled=true;state.lesson.stage=(state.lesson.stage+1)%4;break;
      case 'lesson-reveal':state.lesson.enabled=true;state.lesson.stage=state.lesson.stage<2?2:0;break;
      case 'projector':state.lesson.projector=!state.lesson.projector;if(state.lesson.projector){persist();navigate('operator');return;}break;
      case 'timer-toggle':state.lesson.timerRunning=!state.lesson.timerRunning;lessonDeadline=state.lesson.timerRunning?Date.now()+state.lesson.remaining*1000:null;break;
      case 'timer-reset':state.lesson.timerRunning=false;lessonDeadline=null;state.lesson.remaining=D.lessonPresets[state.lesson.preset][state.lesson.segment].minutes*60;break;
      case 'alarm-raise':case 'alarm-ack':case 'alarm-clear':state.training.alarm=E.alarmTransition(state.training.alarm,action.slice(6));E.addEvent(state.sim,'Учебная тревога',`${action==='alarm-ack'?'Квитирование':action==='alarm-clear'?'Причина устранена':'Возникновение'}; активна: ${state.training.alarm.active?'да':'нет'}, квитирована: ${state.training.alarm.acknowledged?'да':'нет'}`,'Студент');break;
      case 'clear-results':
        if(storageBlocked || !window.confirm('Очистить текущую работу и журнал на этом устройстве? Архив версии 1 сохранится.'))return;
        state.progress=loadProgress({});state.training=freshTraining();state.caseIndex=0;state.quizIndex=0;state.logicOptions={...testDefaults};state.logicResults=null;
        state.sim=E.createScenario(state.sim.id==='manual'?'overheat':state.sim.id,state.sim.rulesKey);E.addEvent(state.sim,'Сценарий','Начата новая учебная работа');
        state.lesson.timerRunning=false;lessonDeadline=null;state.pr1PreviousContext=null;break;
      case 'json':exportJSON();return;
      case 'csv':exportCSV();return;
      case 'print':window.print();return;
      case 'select-link':$('#variantLink').select();toast('Ссылка выделена. Нажмите Ctrl+C.');return;
      case 'download-link':downloadText(variantLink(),'metallab-variant.txt','text/plain;charset=utf-8');return;
    }
    persist();render();
    if(action==='clear-results' && typeof window.dispatchEvent==='function') window.dispatchEvent(new Event('metallab:pr1-reset'));
  });
  document.addEventListener('submit',event=>{
    const element=event.target,f=new FormData(element);event.preventDefault();captureDraft(element);
    switch(element.id){
      case 'manualForm':{
        const missing=f.has('manualMissing'),value=formNumber(f,'manualTemp'),age=formNumber(f,'manualAge'),quality=String(f.get('manualQuality'));
        if((!missing && (!Number.isFinite(value)||Math.abs(value)>10000||!Number.isInteger(age)||age<0||age>300))||!['Good','Bad','Uncertain'].includes(quality)){toast('Проверьте температуру, качество и возраст.');return;}
        E.inject(state.sim,{value:missing?null:value,quality,age:missing?null:age});break;
      }
      case 'nameForm':state.progress.name=String(f.get('studentName')||'').trim().slice(0,80);break;
      case 'workshopForm':workspace().checked=true;workspace().attempts=(workspace().attempts||0)+1;break;
      case 'defectForm':{
        const w=state.training.defectResults[state.sim.rulesKey+':'+state.selectedDefect];
        w.checked=true;w.attempts=(w.attempts||0)+1;
        w.solved=Boolean(w.answer===state.selectedDefect && E.validTest(w.test) && E.evaluate(w.test,activeRules())===w.test.expected && E.evaluateDefect(w.test,state.selectedDefect,activeRules())!==w.test.expected && w.explanation.trim());break;
      }
      case 'revisionForm':state.training.revision.checked=true;state.training.revision.attempts=(state.training.revision.attempts||0)+1;break;
      case 'productionForm':{
        const w=state.training.production[state.workshopCase],item=workshopContext().item;
        w.checked=true;w.attempts=(w.attempts||0)+1;w.solved=Boolean(w.answer===E.productionDecision(item)&&w.explanation.trim());break;
      }
      case 'diagnosticForm':{
        const w=state.training.diagnostics[state.selectedDiagnostic],d=D.diagnostics.find(d=>d.id===state.selectedDiagnostic);
        w.checked=true;w.attempts=(w.attempts||0)+1;w.solved=Boolean(w.location===d.answer&&w.missing===d.missing&&w.explanation.trim());break;
      }
      case 'operatorActionForm':{
        const actions={record:'Зафиксировать отклонение',master:'Сообщить мастеру',verify:'Запросить проверку измерения'};
        const action=String(f.get('operatorAction')),basis=String(f.get('operatorBasis')||'').trim().slice(0,200),comment=String(f.get('operatorComment')||'').trim().slice(0,1500);
        if(!Object.hasOwn(actions,action)||!basis||!comment){toast('Укажите действие, основание и комментарий.');return;}
        E.addEvent(state.sim,'Решение оператора',`${actions[action]}; основание: ${basis}; ${comment}`,'Студент');
        state.sim.events[0].operatorDecision={action,basis,comment};state.training.operatorDraft={};break;
      }
      default:return;
    }
    const ok=persist();render();if(ok)toast('Работа сохранена на этом устройстве.');
  });
  // PR1 integration: switch the visible regulation + workshop together, without deleting
  // workspaces or attempts from other revisions. The previous active scenario is archived
  // in the same session and can be restored through the PR1 panel.
  window.addEventListener('metallab:pr1-select-base',()=>{
    if(storageBlocked){
      window.dispatchEvent(new CustomEvent('metallab:pr1-context-updated',{detail:{ok:false,message:'Сохранение заблокировано: сначала сохраните отчёт.'}}));
      return;
    }
    const changed=state.sim.rulesKey!=='base' || state.workshopCase!=='heating' || state.workshopRevision!=='base';
    if(changed){
      state.pr1PreviousContext={sim:JSON.parse(JSON.stringify(state.sim)),workshopCase:state.workshopCase,workshopRevision:state.workshopRevision};
      state.workshopCase='heating';state.workshopRevision='base';
      if(state.sim.rulesKey!=='base')setRules('base');
      else {persist();render();}
    }
    window.dispatchEvent(new CustomEvent('metallab:pr1-context-updated',{detail:{ok:true,changed}}));
  });
  window.addEventListener('metallab:pr1-restore-context',()=>{
    const prev=state.pr1PreviousContext;
    if(storageBlocked || !prev || !isRecord(prev.sim)){
      window.dispatchEvent(new CustomEvent('metallab:pr1-context-updated',{detail:{ok:false,message:'Сохранённого варианта для возврата нет.'}}));
      return;
    }
    let restored;
    try {restored=E.restoreSim(prev.sim);}
    catch(e){
      window.dispatchEvent(new CustomEvent('metallab:pr1-context-updated',{detail:{ok:false,message:'Не удалось восстановить предыдущий сценарий.'}}));
      return;
    }
    state.sim=restored;
    if(D.productionCases.some(c=>c.id===prev.workshopCase)) state.workshopCase=prev.workshopCase;
    state.workshopRevision=prev.workshopRevision==='revision'?'revision':'base';
    state.pr1PreviousContext=null;
    persist();render();
    window.dispatchEvent(new CustomEvent('metallab:pr1-context-updated',{detail:{ok:true,restored:true}}));
  });
  window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(VIEWS.includes(next)&&next!==state.view){state.view=next;render();}});
  window.addEventListener('pagehide',persist);
  window.setInterval(()=>{
    let changed=false;
    if(state.sim.running){E.tick(state.sim);changed=true;}
    if(state.lesson.timerRunning){
      state.lesson.remaining=Math.max(0,Math.ceil((lessonDeadline-Date.now())/1000));changed=true;
      if(!state.lesson.remaining){state.lesson.timerRunning=false;lessonDeadline=null;toast('Время отрезка занятия закончилось.');}
    }
    if(changed){persist();refreshLive();}
  },1000);
  if(!saved && !storageBlocked) persist(); // Create a valid empty v2 session for the lesson panel.
  render();
})();
