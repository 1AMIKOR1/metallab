'use strict';
const assert=require('node:assert/strict');
const C=require('../js/pr1-core.js');
const base = () => ({schemaVersion:2,progress:{name:'Студент, ИСП-00'},training:{workspaces:{'heating:base':{
  caseId:'heating',rulesKey:'base',checked:true,parameter:{name:'Температура T1',point:'PY-T1',unit:'°C',min:1080,max:1140,maxAge:10,inclusive:true,checkMissing:true,checkQuality:true,checkFreshness:true,reaction:'Отобразить статус и зарегистрировать событие'},
  requirements:Array.from({length:4},(_,i)=>({source:String(i+1),text:'Программа должна выполнять правило '+(i+1)})),
  tests:[{value:1080,quality:'Good',age:3,missing:false,expected:'ready',requirement:'FR-02'},
         {value:null,quality:'Bad',age:null,missing:true,expected:'missing',requirement:'FR-03'},
         {value:1100,quality:'Good',age:11,missing:false,expected:'unreliable',requirement:'FR-03'}]}
},defectResults:{'base:bounds':{checked:true,solved:true,explanation:'Границы исключаются; тест 1080 показывает ошибку.',test:{value:1080,quality:'Good',age:3}}}}});
assert.equal(C.evaluate({value:1080,quality:'Good',age:10}), 'ready');
assert.equal(C.evaluate({value:1140,quality:'Good',age:10}), 'ready');
assert.equal(C.evaluate({value:1141,quality:'Good',age:3}), 'range');
assert.equal(C.evaluate({value:null,quality:'Bad',age:null,missing:true}), 'missing');
assert.equal(C.evaluate({value:1100,quality:'Bad',age:1}), 'unreliable');
assert.equal(C.evaluate({value:1100,quality:'Good',age:11}), 'unreliable');
assert.equal(C.evaluate({value:1100,quality:'Good',age:-1}), 'unreliable');
assert.equal(C.evaluate({value:'1100',quality:'Good',age:3}), null);
const sample=base(),notes={read:true,conclusion:'Установленные правила регламента необходимо проверить тестами для разных состояний датчика.'};
const checks=C.progress(sample,notes);
assert.equal(checks.ready,true);
assert.equal(checks.card,true);
assert.equal(checks.requirements,true);
assert.deepEqual(checks.coverage,{boundary:true,missing:true,stale:true});
const report=C.createReport(sample,notes);
assert.equal(report.tests.length,3);
assert.equal(report.tests[1].actual,'missing');
assert.equal(report.tests[2].consistent,true);
assert.equal(report.defect.id,'bounds');
const altered=base(); altered.training.workspaces['heating:base'].tests[2].expected='ready';
assert.equal(C.progress(altered,notes).tests,false);
const noSource=base();noSource.training.workspaces['heating:base'].requirements[1].source='';
assert.equal(C.progress(noSource,notes).requirements,false);
assert.equal(C.progress(base(),{read:true,conclusion:'Кратко'}).ready,false);
assert.equal(C.getWorkspace({schemaVersion:3,training:{}}),null);
assert.equal(C.escapeHtml('<img src=x>'),'&lt;img src=x&gt;');
// Regression: extra invalid test may not be hidden by three correct category tests.
const extra=base();extra.training.workspaces['heating:base'].tests.push({value:1300,quality:'Good',age:3,missing:false,expected:'ready',requirement:'FR-02'});
assert.equal(C.progress(extra,notes).tests,false);
assert.equal(C.progress(extra,notes).ready,false);
assert.equal(C.createReport(extra,notes).tests[3].consistent,false);
// Editing a checked workspace clears the prior verification and the corresponding step badges.
const edited=base();edited.training.workspaces['heating:base'].checked=false;
const editedProgress=C.progress(edited,notes);
assert.equal(editedProgress.card,false);
assert.equal(editedProgress.requirements,false);
assert.equal(editedProgress.tests,false);
assert.equal(editedProgress.ready,false);
assert.equal(C.createReport(edited,notes).status,'draft');
// Accepted categories, valid ages and source references match the main workshop model.
assert.equal(C.validTest({missing:false,value:1100,age:2.5,quality:'Good',expected:'ready'}),false);
assert.equal(C.validTest({missing:false,value:13000,age:2,quality:'Good',expected:'range'}),false);
const invalidSource=base();invalidSource.training.workspaces['heating:base'].requirements[0].source='§999';
assert.equal(C.progress(invalidSource,notes).requirements,false);
const unverifiedDefect=base();unverifiedDefect.training.defectResults['base:bounds'].checked=false;
assert.equal(C.progress(unverifiedDefect,notes).defect,false);
assert.equal(C.createReport(base(),notes).status,'complete');
assert.equal(C.createReport(extra,notes).status,'draft');
console.log('PR1 core: all tests passed');
