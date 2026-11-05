/* Pure teaching models. No equipment connections or control commands. */
(function (root) {
  'use strict';
  const D = root.SimData;
  const BASE_TIME_MS = Date.UTC(2026, 9, 30, 10, 24, 10);
  const MAX_HISTORY = 300;
  const QUALITY = ['Good', 'Bad', 'Uncertain'];

  function rulesFor(key = 'base') {
    if (key === 'base') return D.rules;
    if (!Object.hasOwn(D.regulations, key)) throw new RangeError('Unknown teaching regulation: ' + key);
    return D.regulations[key];
  }
  function evaluate(reading, rules = D.rules) {
    if (!reading || !Number.isFinite(reading.value)) return 'missing';
    if (reading.quality !== 'Good' || !Number.isFinite(reading.age) || reading.age < 0 || reading.age > rules.maxAge) return 'unreliable';
    return reading.value >= rules.min && reading.value <= rules.max ? 'ready' : 'range';
  }
  function evaluateCandidate(reading, config, rules = D.rules) {
    const c = config || {};
    if (c.checkMissing && (!reading || !Number.isFinite(reading.value))) return 'missing';
    if (c.checkQuality && (!reading || reading.quality !== 'Good')) return 'unreliable';
    if (c.checkFreshness && (!reading || !Number.isFinite(reading.age) || reading.age < 0 || reading.age > rules.maxAge)) return 'unreliable';
    const value = reading && reading.value !== null ? reading.value : NaN;
    return (c.inclusiveBounds ? value >= rules.min && value <= rules.max : value > rules.min && value < rules.max) ? 'ready' : 'range';
  }
  function evaluateDefect(reading, defect, rules = D.rules) {
    if (defect === 'age') {
      if (!Number.isFinite(reading.value)) return 'missing';
      if (reading.quality !== 'Good' || reading.age < rules.maxAge) return 'unreliable';
      return reading.value >= rules.min && reading.value <= rules.max ? 'ready' : 'range';
    }
    return evaluateCandidate(reading, {checkMissing:true, checkQuality:defect !== 'quality', checkFreshness:true, inclusiveBounds:defect !== 'bounds'}, rules);
  }
  function validTest(test) {
    return test && !(test.missing === false && test.value === null) && (test.value === null || (Number.isFinite(test.value) && Math.abs(test.value) <= 10000)) &&
      QUALITY.includes(test.quality) && (test.value === null ? test.age === null || (Number.isInteger(test.age) && test.age >= 0 && test.age <= 300) : Number.isInteger(test.age) && test.age >= 0 && test.age <= 300) && (Object.hasOwn(D.statuses, test.expected) || test.expected === 'context');
  }
  function studentTestResult(test,rules,caseId) {
    const item = D.productionCases.find(c=>c.id===caseId);
    if (test.scope !== 'process' || !item?.extra.length) return evaluate(test,rules);
    const extra = item.extra.map(r=>({...r,
      ...(test.context === 'matching' || test.context === 'good' ? {batch:r.expectedBatch || r.batch} : {}),
      ...(test.context === 'good' ? {quality:'Good',age:0} : {})
    }));
    return productionDecision(item,{reading:test,extra});
  }
  function testsFor(rules = D.rules) {
    const middle = (rules.min + rules.max) / 2;
    return [
      [middle,'Good',3], [rules.max+6,'Good',3], [rules.min,'Good',Math.max(0,rules.maxAge-1)],
      [rules.max,'Good',rules.maxAge], [rules.max+1,'Good',2], [middle,'Good',rules.maxAge+1],
      [middle,'Bad',1], [null,'Bad',null], [rules.min-12,'Good',3], [middle,'Uncertain',2]
    ].map(([value,quality,age],i) => ({id:D.cases[i].id,value,quality,age,answer:evaluate({value,quality,age},rules)}));
  }
  function assessWorkshop(work, rules = D.rules) {
    const p = work.parameter || {}, requirements = work.requirements || [], tests = work.tests || [];
    const cardChecks = [Boolean(p.name?.trim()), Boolean(p.point?.trim()), p.unit === rules.unit,
      p.min === rules.min, p.max === rules.max, p.maxAge === rules.maxAge,
      p.inclusive === true, p.checkMissing === true, p.checkQuality === true, p.checkFreshness === true,
      Boolean(p.reaction?.trim())];
    const completeRequirements = requirements.filter(r => typeof r.text === 'string' && r.text.trim() && ['1','2','3','4','5'].includes(r.source)).length;
    const results = tests.map(t => ({valid:validTest(t), ok:Boolean(validTest(t) && studentTestResult(t,rules,work.caseId) === t.expected)}));
    const correctTests = tests.filter((t,i) => results[i].ok);
    const coverage = {
      boundary:correctTests.some(t => t.quality === 'Good' && t.age <= rules.maxAge && (t.value === rules.min || t.value === rules.max)),
      missing:correctTests.some(t => t.value === null),
      stale:correctTests.some(t => Number.isFinite(t.value) && t.quality === 'Good' && t.age > rules.maxAge)
    };
    const item = D.productionCases.find(c=>c.id===work.caseId);
    const processCovered = !item?.extra.length || correctTests.some(t=>t.scope==='process' && t.context==='original' && t.expected===productionDecision(item));
    return {cardChecks, completeRequirements, results, coverage, processCovered, readyForReview:cardChecks.every(Boolean) && completeRequirements >= 4 && tests.length >= 3 && results.every(r => r.ok) && Object.values(coverage).every(Boolean) && processCovered};
  }
  function correctOrder(order) {
    return Array.isArray(order) && order.length === 4 && order[0] === 'missing' && order[3] === 'range' && new Set(order).size === 4 && order.includes('quality') && order.includes('freshness');
  }
  function checkRevision(work) {
    const rules = rulesFor('revision');
    const expected = ['FR-02','FR-03'];
    const changed = Array.isArray(work.requirements) && work.requirements.length === 2 && expected.every(id => work.requirements.includes(id));
    const configured = work.max === rules.max && work.maxAge === rules.maxAge;
    const tests = work.tests || [];
    const valid = tests.length >= 3 && tests.every(t => validTest(t) && evaluate(t,rules) === t.expected);
    const bounds = tests.some(t => t.value === rules.max && t.quality === 'Good' && t.age <= rules.maxAge);
    const temperatureChanged = tests.some(t => validTest(t) && t.value > rules.max && t.value <= D.rules.max && t.quality === 'Good' && t.age <= rules.maxAge);
    const freshnessChanged = tests.some(t => validTest(t) && t.value >= rules.min && t.value <= rules.max && t.quality === 'Good' && t.age > rules.maxAge && t.age <= D.rules.maxAge);
    const explanationProvided = typeof work.explanation === 'string' && Boolean(work.explanation.trim());
    return {changed, configured, valid, bounds, temperatureChanged, freshnessChanged, explanationProvided, ok:changed && configured && valid && bounds && temperatureChanged && freshnessChanged && explanationProvided};
  }
  function productionDecision(item, overrides = {}) {
    const rules = rulesFor(item.rulesKey);
    const primary = evaluate(overrides.reading || item.reading, rules);
    if (primary !== 'ready') return primary;
    const extra = overrides.extra || item.extra;
    if (extra.some(r => r.value === null || r.value === undefined || (typeof r.value === 'number' && !Number.isFinite(r.value)))) return 'missing';
    if (extra.some(r => !Number.isFinite(r.age) || r.age < 0 || r.age > rules.maxAge || r.quality !== 'Good')) return 'unreliable';
    if (extra.some(r => r.expectedBatch && r.batch !== r.expectedBatch)) return 'context';
    if (extra.some(r => r.expectedValue !== undefined && r.value !== r.expectedValue)) return 'range';
    if (extra.some(r => Number.isFinite(r.min) && (r.value < r.min || r.value > r.max))) return 'range';
    return 'ready';
  }
  function clockString(seconds = 0) {
    return new Date(BASE_TIME_MS + seconds * 1000).toLocaleTimeString('ru-RU',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  function isoClock(seconds = 0) { return new Date(BASE_TIME_MS + seconds * 1000).toISOString(); }
  function sourceSeconds(sim) {
    if (!Number.isFinite(sim.reading.value) || !Number.isFinite(sim.reading.age)) return null;
    return sim.elapsed - sim.reading.age;
  }
  function dataValue(sim) {
    const sec = sourceSeconds(sim);
    return {Value:sim.reading.quality === 'Bad' ? null : sim.reading.value, StatusCode:sim.reading.quality,
      SourceTimestamp:sec === null ? null : isoClock(sec), ServerTimestamp:isoClock(sim.elapsed)};
  }
  function getEvent(sim, type, note, action = 'Система') {
    const rules = rulesFor(sim.rulesKey);
    return {time:clockString(sim.elapsed),timestamp:isoClock(sim.elapsed),sourceTimestamp:sourceSeconds(sim) === null ? null : isoClock(sourceSeconds(sim)),
      type,scenario:sim.id,specimen:sim.reading.specimen || rules.specimen,sensorId:rules.sensorId,value:sim.reading.value,unit:rules.unit,
      quality:sim.reading.quality,age:sim.reading.age,status:sim.status,regulation:`${rules.id} v${rules.version}`,appVersion:D.version,
      phase:sim.phase,holdElapsed:sim.holdElapsed,processDecision:readiness(sim),action,note};
  }
  function addEvent(sim,type,note,action) {
    sim.events.unshift(getEvent(sim,type,note,action));
    sim.events = sim.events.slice(0,250);
  }
  function addHistory(sim) {
    sim.history.push({t:sim.elapsed,v:sim.reading.value,quality:sim.reading.quality,status:sim.status});
    sim.history = sim.history.slice(-MAX_HISTORY);
  }
  function createScenario(id = 'overheat', rulesKey = 'base') {
    const cycle = D.cycles.find(s => s.id === id);
    const preset = cycle || D.scenarios.find(s => s.id === id) || D.scenarios[0];
    if (cycle) rulesKey = 'cycle';
    const rules = rulesFor(rulesKey);
    const reading = {value:cycle ? 1060 : preset.value,quality:cycle ? 'Good' : preset.quality,age:cycle ? 0 : preset.age,sensorId:rules.sensorId,specimen:cycle?.variant === 'batch' ? 'А-018' : rules.specimen};
    const status = evaluate(reading,rules);
    return {id:preset.id,rulesKey,mode:cycle ? 'cycle' : preset.mode,target:preset.target ?? null,elapsed:0,scenarioTick:0,running:false,reading,status,
      history:[{t:0,v:reading.value,quality:reading.quality,status}],events:[],previousStatus:status,phase:cycle ? 'Загрузка' : '',holdSince:null,holdElapsed:0};
  }
  function readiness(sim) {
    const rules = rulesFor(sim.rulesKey);
    if (sim.status !== 'ready') return D.statuses[sim.status].name;
    if (sim.reading.specimen !== rules.specimen) return 'Партия не совпадает';
    if (rules.holdSeconds && sim.holdElapsed < rules.holdSeconds) return 'Выдержка не завершена';
    return 'Условия выполнены';
  }
  function tick(sim) {
    const priorPhase=sim.phase,priorDecision=readiness(sim);
    sim.elapsed += 1;
    sim.scenarioTick += 1;
    const r = sim.reading, rules = rulesFor(sim.rulesKey);
    if (sim.mode === 'cycle') {
      const t = sim.scenarioTick, variant = D.cycles.find(s => s.id === sim.id).variant;
      sim.phase = t < 3 ? 'Загрузка' : t < 8 ? 'Нагрев' : t < 20 ? 'Выдержка' : 'Передача на прокатку';
      if (variant === 'fault' && t >= 10 && t <= 13) {
        r.quality = 'Bad'; r.age += 1;
      } else {
        r.value = t < 8 ? 1060 + t*5 : variant === 'delay' && t >= 20 ? Math.max(1060,1100-(t-20)*5) : 1100;
        r.quality = 'Good'; r.age = 0;
      }
    } else if (sim.mode === 'freeze' || sim.mode === 'manual') {
      if (Number.isFinite(r.age)) r.age += 1;
    } else if (sim.mode === 'missing') {
      r.value = null; r.quality = 'Bad'; r.age = null;
    } else if (sim.elapsed % 2 === 0) {
      r.value = Number((sim.target + 1.85*Math.sin(sim.elapsed*0.31) + 1.2*Math.sin(sim.elapsed*0.19)).toFixed(1)); r.age = 0;
    } else if (Number.isFinite(r.age)) r.age += 1;
    sim.status = evaluate(r,rules);
    if (rules.holdSeconds) {
      if (sim.status === 'ready' && r.specimen === rules.specimen && ['Выдержка','Передача на прокатку'].includes(sim.phase)) {
        if (sim.holdSince === null) sim.holdSince = sim.elapsed;
        sim.holdElapsed = Math.min(rules.holdSeconds,sim.elapsed-sim.holdSince);
      } else { sim.holdSince = null; sim.holdElapsed = 0; }
    }
    if (sim.status !== sim.previousStatus) {
      const label = status => rules.holdSeconds && status==='ready' ? 'В допуске' : D.statuses[status].name;
      addEvent(sim,'Изменение статуса измерения',`Измерение: ${label(sim.previousStatus)} → ${label(sim.status)}`);
      sim.previousStatus = sim.status;
    }
    if (sim.phase!==priorPhase) addEvent(sim,'Этап процесса',`${priorPhase || '—'} → ${sim.phase}`);
    if (readiness(sim)!==priorDecision) addEvent(sim,'Проверка условий',readiness(sim));
    addHistory(sim);
    return sim;
  }
  function inject(sim,reading) {
    sim.running = false; sim.id = 'manual'; sim.mode = 'manual'; sim.target = reading.value;
    const rules = rulesFor(sim.rulesKey);
    sim.reading = {...reading,sensorId:rules.sensorId,specimen:reading.specimen || sim.reading.specimen || rules.specimen};
    sim.status = evaluate(sim.reading,rules); sim.previousStatus = sim.status;
    sim.holdSince = null; sim.holdElapsed = 0; sim.phase = '';
    addHistory(sim);
    addEvent(sim,'Ручная проверка','Пользователь задал тестовые входные данные','Студент');
    return sim;
  }
  function historySegments(history) {
    const segments = []; let current = null;
    for (const p of history) {
      if (!Number.isFinite(p.v)) { current = null; continue; }
      const reliable = p.quality === 'Good' && p.status !== 'unreliable';
      if (!current || current.reliable !== reliable) { current = {reliable,points:[]}; segments.push(current); }
      current.points.push(p);
    }
    return segments;
  }
  function alarmTransition(alarm, action) {
    if (action === 'raise') return {active:true,acknowledged:false};
    if (action === 'ack') return {...alarm,acknowledged:true};
    if (action === 'clear') return {...alarm,active:false};
    throw new RangeError('Unknown alarm action: ' + action);
  }
  function restoreSim(saved) {
    if (!saved || typeof saved !== 'object' || !['base',...Object.keys(D.regulations)].includes(saved.rulesKey)) throw new TypeError('Invalid saved simulation regulation');
    if (!Number.isSafeInteger(saved.elapsed) || saved.elapsed < 0 || saved.elapsed > 10000000 || !Number.isSafeInteger(saved.scenarioTick) || saved.scenarioTick < 0 || saved.scenarioTick > saved.elapsed) throw new TypeError('Invalid saved simulation clock');
    if (![...D.scenarios,...D.cycles].some(s => s.id === saved.id) && saved.id !== 'manual') throw new TypeError('Invalid saved scenario');
    if (!validTest({...saved.reading,expected:'ready'}) && !(saved.reading && Number.isFinite(saved.reading.value) && QUALITY.includes(saved.reading.quality) && Number.isFinite(saved.reading.age) && saved.reading.age >= 0 && saved.reading.age <= 10000000)) throw new TypeError('Invalid saved reading');
    if (!Array.isArray(saved.history) || !Array.isArray(saved.events)) throw new TypeError('Invalid saved simulation history');
    if (!saved.history.every(p=>p && Number.isFinite(p.t) && p.t>=0 && (p.v===null || Number.isFinite(p.v)) && QUALITY.includes(p.quality) && Object.hasOwn(D.statuses,p.status))) throw new TypeError('Invalid saved history point');
    if (!saved.events.every(e=>e && ['type','note','time'].every(key=>typeof e[key]==='string'))) throw new TypeError('Invalid saved event');
    const sim = createScenario(saved.id,saved.rulesKey);
    Object.assign(sim,{elapsed:saved.elapsed,scenarioTick:saved.scenarioTick,reading:saved.reading,history:saved.history.slice(-MAX_HISTORY),events:saved.events.slice(0,250),running:false});
    if (saved.id === 'manual') { sim.id = 'manual'; sim.mode = 'manual'; sim.target = sim.reading.value; }
    sim.status = evaluate(sim.reading,rulesFor(sim.rulesKey)); sim.previousStatus = sim.status;
    sim.phase = typeof saved.phase === 'string' ? saved.phase : '';
    sim.holdSince = Number.isInteger(saved.holdSince) && saved.holdSince >= 0 && saved.holdSince <= sim.elapsed ? saved.holdSince : null;
    sim.holdElapsed = sim.holdSince === null ? 0 : Math.min(rulesFor(sim.rulesKey).holdSeconds || 0,sim.elapsed-sim.holdSince);
    return sim;
  }
  root.SimEngine = Object.freeze({rulesFor,evaluate,evaluateCandidate,evaluateDefect,validTest,studentTestResult,testsFor,assessWorkshop,correctOrder,checkRevision,productionDecision,
    createScenario,clockString,isoClock,sourceSeconds,dataValue,getEvent,addEvent,tick,inject,readiness,historySegments,alarmTransition,restoreSim});
})(window);
