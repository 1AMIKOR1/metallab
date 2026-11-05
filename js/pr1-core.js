/* MetalLab PR1 v1.1.0. Independent checks, no industrial control. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MetalLabPR1Core = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const RULES = Object.freeze({id:'ТР-УЧ-01',version:'1.0',min:1080,max:1140,maxAge:10,unit:'°C',sensorId:'PY-T1'});
  const reqIds = ['FR-01','FR-02','FR-03','FR-04'];
  const qualities = ['Good','Bad','Uncertain'];
  const statuses = ['ready','range','missing','unreliable'];
  const goodString = v => typeof v === 'string' && v.trim().length > 0;
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

  function evaluate(test) {
    if (!isObj(test)) return null;
    if (test.missing === true || test.value === null) return 'missing';
    if (!isNum(test.value)) return null;
    if (test.quality !== 'Good' || !isNum(test.age) || test.age < 0 || test.age > RULES.maxAge) return 'unreliable';
    return test.value >= RULES.min && test.value <= RULES.max ? 'ready' : 'range';
  }
  // Match the simulator's input contract, not just its expected status.
  function validTest(test) {
    if (!isObj(test) || typeof test.missing !== 'boolean' || !qualities.includes(test.quality) || !statuses.includes(test.expected)) return false;
    if (test.missing) return test.value === null && (test.age === null || (Number.isInteger(test.age) && test.age >= 0 && test.age <= 300));
    return isNum(test.value) && Math.abs(test.value) <= 10000 && Number.isInteger(test.age) && test.age >= 0 && test.age <= 300;
  }
  function testIsCorrect(test) { return validTest(test) && evaluate(test) === test.expected; }
  function getWorkspace(session) {
    if (!isObj(session) || session.schemaVersion !== 2 || !isObj(session.training) || !isObj(session.training.workspaces)) return null;
    const w = session.training.workspaces['heating:base'];
    return isObj(w) && w.caseId === 'heating' && w.rulesKey === 'base' ? w : null;
  }
  function getDefect(session) {
    const dict = session?.training?.defectResults;
    if (!isObj(dict)) return null;
    const entry = Object.entries(dict).find(([key, item]) => key.startsWith('base:') && isObj(item) && item.checked === true && item.solved === true);
    return entry ? {id:entry[0].split(':').slice(1).join(':'),...entry[1]} : null;
  }
  function cardValid(w) {
    const p = w?.parameter;
    if (!isObj(p)) return false;
    return goodString(p.name) && goodString(p.point) && p.unit === RULES.unit && p.min === RULES.min && p.max === RULES.max && p.maxAge === RULES.maxAge &&
      p.inclusive === true && p.checkMissing === true && p.checkQuality === true && p.checkFreshness === true && goodString(p.reaction);
  }
  function requirementsValid(w) {
    return Array.isArray(w?.requirements) && w.requirements.length === 4 &&
      w.requirements.every(r => isObj(r) && ['1','2','3','4','5'].includes(r.source) && goodString(r.text));
  }
  function testCoverage(w) {
    const coverage = {boundary:false,missing:false,stale:false};
    for (const t of Array.isArray(w?.tests) ? w.tests : []) {
      if (!testIsCorrect(t)) continue;
      if (t.missing && t.expected === 'missing') coverage.missing = true;
      if ((t.value === RULES.min || t.value === RULES.max) && t.quality === 'Good' && t.age <= RULES.maxAge && t.expected === 'ready') coverage.boundary = true;
      if (!t.missing && isNum(t.value) && t.quality === 'Good' && t.age > RULES.maxAge && t.expected === 'unreliable') coverage.stale = true;
    }
    return coverage;
  }
  function progress(session, notes={}) {
    const w = getWorkspace(session), defect = getDefect(session), coverage = testCoverage(w);
    const tests = Array.isArray(w?.tests) ? w.tests : [];
    const testsCorrect = tests.length >= 3 && tests.every(testIsCorrect) && Object.values(coverage).every(Boolean);
    const verified = !!w?.checked; // Editing any workshop field invalidates the previous check.
    const student = typeof session?.progress?.name === 'string' ? session.progress.name.trim() : '';
    const conclusion = goodString(notes.conclusion) && notes.conclusion.trim().length >= 30;
    const card = verified && cardValid(w), requirements = verified && requirementsValid(w), validTests = verified && testsCorrect;
    const result = {
      sessionValid:session?.schemaVersion === 2 && isObj(session?.training),
      regulationRead:notes.read === true,
      studentKnown:student.length > 0,
      card, requirements, tests:validTests, testsCorrect, coverage,
      defect:!!defect, conclusion, checked:verified,
      ready:student.length > 0 && notes.read === true && card && requirements && validTests && !!defect && conclusion
    };
    return result;
  }
  function draftReasons(p) {
    const reasons = [];
    if (!p.sessionValid) reasons.push('Нет сохранённой сессии MetalLab');
    if (!p.studentKnown) reasons.push('Не указаны имя и группа');
    if (!p.regulationRead) reasons.push('Не подтверждено чтение регламента');
    if (!p.checked) reasons.push('Мастерская не проверена после последнего изменения');
    if (!p.card) reasons.push('Карточка параметра не проверена');
    if (!p.requirements) reasons.push('Четыре требования не проверены');
    if (!p.tests) reasons.push('Не все тесты верны или недостаточно покрытие');
    if (!p.defect) reasons.push('Нет подтверждённого дефекта');
    if (!p.conclusion) reasons.push('Вывод короче 30 символов');
    return reasons;
  }
  function createReport(session, notes={}) {
    const w = getWorkspace(session), p = progress(session,notes), defect = getDefect(session);
    return {schemaVersion:1,reportType:'metallab-pr1',pr1AddonVersion:'1.1.0',createdAt:new Date().toISOString(),
      appSourceVersion:'2.0.0',status:p.ready?'complete':'draft',draftReasons:p.ready?[]:draftReasons(p),
      student:session?.progress?.name||'',regulation:RULES,
      task:'Практическая работа № 1. Работа с описанием технологического регламента',
      parameter:w?.parameter||null,
      requirements:(w?.requirements||[]).map((r,i)=>({id:reqIds[i]||('FR-'+(i+1)),source:r.source||'',text:r.text||''})),
      tests:(w?.tests||[]).map((t,i)=>({id:'TEST-'+(i+1),value:t.value,quality:t.quality,age:t.age,missing:t.missing,expected:t.expected,actual:validTest(t)?evaluate(t):null,requirement:t.requirement||'',consistent:testIsCorrect(t)})),
      defect:defect?{id:defect.id,explanation:defect.explanation||'',test:defect.test||null,solved:true}:null,
      conclusion:notes.conclusion||'',checklist:p,
      comment:'Автоматические отметки показывают полноту и согласованность структурированных данных, но не оценивают качество текста и самостоятельность работы. Все значения учебные.'};
  }
  function escapeHtml(s) {return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  return {RULES,evaluate,validTest,testIsCorrect,getWorkspace,getDefect,cardValid,requirementsValid,testCoverage,progress,draftReasons,createReport,escapeHtml};
});
