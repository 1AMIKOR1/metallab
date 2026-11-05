// Run with node tests/app.test.cjs. No browser or dependencies required.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
let checks=0;
function check(condition,message){assert(condition,message);checks++;}
function boot(hash='',initial={},options={}){
  const values=new Map(Object.entries(initial));
  const events={},elements={},downloads=[];let lastBlob=null;class TestBlob{constructor(parts){this.content=parts.join('');}}class TestURL extends URL{static createObjectURL(blob){lastBlob=blob;return 'blob:test';}static revokeObjectURL(){}}let clock=Date.now();class TestDate extends Date{static now(){return clock;}}
  for(const id of ['main','toast','saveWarning','regChip','breadcrumbCurrent'])elements['#'+id]={innerHTML:'',textContent:'',hidden:true,classList:{add(){},remove(){}},focus(){}};
  const document={createElement:()=>({click(){downloads.push({name:this.download,content:lastBlob.content});},remove(){}}),querySelector:s=>s==='input[name="taskChoice"]:checked' && options.selection ? {value:options.selection} : elements[s]||null,querySelectorAll:()=>[],body:{appendChild(){},classList:{toggle(){}}},addEventListener:(type,callback)=>events['document:'+type]=callback};
  const location={hash,search:options.search||'',href:'http://localhost/index.html'+(options.search||'')+hash};
  const errors=[];
  const window={document,location,localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(options.quota)throw new Error('Quota exceeded');values.set(key,value);}},addEventListener:(type,callback)=>events[type]=callback,setInterval:callback=>events.interval=callback,setTimeout(){},clearTimeout(){},scrollTo(){}};
  const sandbox={window,document,location,URL:TestURL,Blob:TestBlob,URLSearchParams,Date:TestDate,console:{error:(...args)=>errors.push(args)},setTimeout(){}};
  vm.createContext(sandbox);
  for(const file of ['js/data.js','js/engine.js','js/app.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
  return {downloads,html:()=>elements['#main'].innerHTML,values,events,errors,elements,window,advance:ms=>clock+=ms};
}
for(const [view,title] of [['operator','Пульт оператора'],['regulation','Технологический регламент'],['workshop','Мастерская требований'],['practice','Решайте производственные задачи'],['logic','Лаборатория тестирования'],['revision','Регламент изменился'],['production','Производственные кейсы'],['architecture','Диагностика данных'],['results','Мои результаты'],['teacher','Кабинет преподавателя']]){
  const app=boot('#'+view);check(app.html().includes(title),'render '+view);check(!app.errors.length,'no error rendering '+view);
}
const v1=JSON.stringify({cases:{C01:{selected:'ready',attempts:1,solved:true,points:2}},quiz:{Q01:{points:1,solved:true}},logicBest:7,name:'Student'});
const imported=boot('#results',{'metallab.training.v1':v1});
check(imported.html().includes('10<small> / 36'),'legacy score retained');
imported.events.pagehide();
const stored=JSON.parse(imported.values.get('metallab.training.v2'));
check(stored.schemaVersion===2,'v2 schema written');check(imported.values.get('metallab.training.v1')===v1,'v1 storage untouched');
check(stored.legacyProgress.logicBest===7,'legacy diagnostic score retained');
check(stored.progress.cases.C01.points===2,'old case answers available');
const restored=boot('#operator',{'metallab.training.v2':JSON.stringify(stored)});
check(!restored.errors.length,'session restores');check(restored.html().includes('Открыта учебная модель'),'journal restored');
const invalid=boot('#operator',{'metallab.training.v2':'null'});
check(!invalid.elements['#saveWarning'].hidden,'null storage displays warning');invalid.events.pagehide();
check(invalid.values.get('metallab.training.v2')==='null','invalid original not overwritten');
const broken=structuredClone(stored);broken.training.order=['unknown'];
const corrupt=boot('#logic',{'metallab.training.v2':JSON.stringify(broken)});
check(!corrupt.elements['#saveWarning'].hidden,'corrupt nested state displays warning');check(corrupt.html().includes('Лаборатория тестирования'),'invalid draft does not crash UI');
const quota=boot('#operator',{}, {quota:true});quota.events.pagehide();
check(!quota.elements['#saveWarning'].hidden,'failed writes are visible');check(quota.errors.length===1,'failed write is logged');
const revision=boot('#practice',{}, {search:'?rules=revision'});
check(revision.html().includes('1130'),'practice follows selected regulation');check(revision.html().includes('5 секунд'),'practice follows freshness limit');
const projector=boot('#operator',{}, {search:'?scenario=heating-fault&lesson=1&projector=1&duration=90'});
check(projector.html().includes('Ответ скрыт'),'lesson hides measurement answer');check(projector.html().includes('Журнал скрыт'),'lesson hides journal answer');check(!projector.html().includes('Статус: Готова'),'no status leak in hidden journal');
projector.events.pagehide();const shared=JSON.parse(projector.values.get('metallab.training.v2'));
check(shared.lesson.preset===90 && shared.lesson.projector && shared.sim.id==='heating-fault','variant link settings honored');
function action(app,name){app.events['document:click']({target:{closest:selector=>selector==='[data-action]'?{dataset:{action:name}}:null}});}
const uncompleted=JSON.stringify({cases:{},quiz:{},logicBest:7});
const migration=boot('#practice',{'metallab.training.v1':uncompleted},{selection:'ready'});
action(migration,'case-check');
const migrated=JSON.parse(migration.values.get('metallab.training.v2'));
check(migrated.progress.cases.C01.points===2,'new case result saved after migration');
check(!migrated.legacyProgress.cases.C01,'legacy archive does not share mutable score objects');
const diagnostic=boot('#logic',{'metallab.training.v1':v1});action(diagnostic,'logic-run');
const run=JSON.parse(diagnostic.values.get('metallab.training.v2'));
check(run.training.logicBest.base===7,'default algorithm reports seven passing tests');
check(run.progress.logicBest===7 && run.legacyProgress.logicBest===7,'diagnostic run does not modify old logic score');
check(run.progress.cases.C01.points===2,'diagnostic run awards no case points');
const timer=boot('#teacher');action(timer,'timer-toggle');timer.advance(3000);timer.events.interval();
let timed=JSON.parse(timer.values.get('metallab.training.v2'));
check(timed.lesson.remaining===717,'timer counts elapsed wall time');action(timer,'timer-toggle');timer.advance(5000);timer.events.interval();timer.events.pagehide();
timed=JSON.parse(timer.values.get('metallab.training.v2'));
check(timed.lesson.remaining===717 && timed.lesson.timerRunning===false,'paused timer stays still');
const pauseRestore=boot('#teacher',{'metallab.training.v2':JSON.stringify({...timed,lesson:{...timed.lesson,timerRunning:true}})});pauseRestore.events.pagehide();
check(JSON.parse(pauseRestore.values.get('metallab.training.v2')).lesson.timerRunning===false,'reloaded timer pauses');
quota.events.pagehide();check(quota.errors.length===1,'repeated storage failures do not spam logs');
const brokenEvent=structuredClone(stored);brokenEvent.sim.events=[null];
const eventApp=boot('#operator',{'metallab.training.v2':JSON.stringify(brokenEvent)});
check(!eventApp.elements['#saveWarning'].hidden,'invalid journal is preserved with warning');
const reportApp=boot('#results',{'metallab.training.v2':JSON.stringify(stored)});action(reportApp,'json');
const report=JSON.parse(reportApp.downloads[0].content);
check(report.schemaVersion===2 && report.version==='2.0.0','report version is explicit');
check(report.legacyProgress.logicBest===7 && report.progress.cases.C01.points===2,'report preserves legacy and current results');
check(Array.isArray(report.events) && Array.isArray(report.workshopReports),'report includes journal and workshop records');
check(report.rules.id==='ТР-УЧ-01' && report.revisionTrace,'report includes regulation and change checks');
check(reportApp.downloads[0].name==='metallab-report-v2.json','report filename');
action(reportApp,'csv');check(reportApp.downloads[1].content.includes('sourceTimestamp;appVersion;scenario'),'CSV includes reproducibility metadata');
console.log(`OK: ${checks} app checks`);
