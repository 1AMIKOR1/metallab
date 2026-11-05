/* MetalLab PR1 v1.1.0 - lesson panel; no industrial connections. */
(function () {
  'use strict';
  const C=window.MetalLabPR1Core;
  if(!C){console.error('PR1 extension: pr1-core.js must load before pr1-addon.js');return;}
  const NOTES_KEY='metallab.pr1.notes.v1';
  const SESSION_KEY='metallab.training.v2';
  const read=(key)=>{try{const value=localStorage.getItem(key);return value?JSON.parse(value):null;}catch(e){return null;}};
  const session=()=>read(SESSION_KEY);
  const emptyNotes=(owner='')=>({read:false,conclusion:'',owner});
  let notes=read(NOTES_KEY)||emptyNotes();
  let warning='';
  const esc=C.escapeHtml;
  const steps=[
    ['reg','Прочитать ТР-УЧ-01 v1.0','regulation','Найдите объект контроля, диапазон, допустимый возраст, условия Good и реакцию на отклонение.'],
    ['card','Заполнить карточку параметра','workshop','Укажите датчик, единицу измерения, границы, качество и свежесть данных.'],
    ['req','Составить FR-01 – FR-04','workshop','У каждого требования должен быть источник и проверяемый результат.'],
    ['tests','Проверить три теста','workshop','Нужны граница, отсутствующее значение и устаревшее значение. Все дополнительные тесты тоже должны быть верными.'],
    ['defect','Найти один дефект','logic','Доказать ошибку собственным тестом в лаборатории.'],
    ['conclusion','Сформулировать вывод',null,'Кратко объясните, как регламент превращается в требования к ПО.']
  ];
  function owner(s) {return String(s?.progress?.name||'').trim();}
  function saveNotes(){
    try{localStorage.setItem(NOTES_KEY,JSON.stringify(notes));warning='';return true;}
    catch(e){warning='Не удалось сохранить данные ПР1. Скачайте отчёт и проверьте настройки браузера.';return false;}
  }
  function syncOwner(s){
    const current=owner(s);
    if(notes.owner && notes.owner!==current){notes=emptyNotes(current);saveNotes();}
  }
  function differs(s){
    if(!s || s.schemaVersion!==2)return false;
    return (s.sim?.rulesKey||'base')!=='base' || (s.workshopCase||'heating')!=='heating' || (s.workshopRevision||'base')!=='base';
  }
  function activeVariant(s){
    const chunks=[];
    if((s?.sim?.rulesKey||'base')!=='base')chunks.push('на пульте: '+(s.sim.rulesKey==='revision'?'ТР-УЧ-01 v2.0':s.sim.rulesKey));
    if((s?.workshopCase||'heating')!=='heating')chunks.push('кейс мастерской: '+s.workshopCase);
    if((s?.workshopRevision||'base')!=='base')chunks.push('в мастерской: ТР-УЧ-01 v2.0');
    return chunks.join('; ');
  }
  function statusMap(p){return {reg:p.regulationRead,card:p.card,req:p.requirements,tests:p.tests,defect:p.defect,conclusion:p.conclusion};}
  function statusInfo(s){
    const p=C.progress(s,notes),states=statusMap(p),done=Object.values(states).filter(Boolean).length;
    return {p,states,done};
  }
  function refreshIndicators(){
    const {p,states,done}=statusInfo(session());
    const panel=document.querySelector('#pr1Panel');
    if(panel && !panel.hidden){
      const counter=panel.querySelector('.pr1-subline .pr1-step-count');if(counter)counter.textContent=`${done}/6 этапов по контрольному перечню`;
      const progress=panel.querySelector('.pr1-progress');if(progress){progress.setAttribute('aria-valuenow',done);progress.firstElementChild.style.width=`${done/6*100}%`;}
      steps.forEach(([key],i)=>{const el=panel.querySelector(`[data-pr1-step="${key}"] .pr1-number`);if(!el)return;el.textContent=states[key]?'✓':String(i+1);el.classList.toggle('pr1-done',states[key]);});
      const status=panel.querySelector('#pr1ReportStatus');
      if(status)status.textContent=p.ready?'Проверка полноты пройдена. Смысл ответов оценивает преподаватель.':'Отчёт пока будет отмечен как черновик. '+(p.checked?'':'После изменения мастерской нажмите «Проверить работу».');
    }
    const badge=document.querySelector('#pr1Launcher .pr1-launch-count');if(badge)badge.textContent=`${done}/6`;
  }
  function draw(){
    const saved=session();syncOwner(saved);
    const {p,states,done}=statusInfo(saved);
    const mismatch=differs(saved);
    const rows=steps.map(([key,label,route,description],idx)=>`<li class="pr1-step" data-pr1-step="${key}">
      <span class="pr1-number ${states[key]?'pr1-done':''}" aria-hidden="true">${states[key]?'✓':idx+1}</span>
      <div class="pr1-step-body"><strong>${esc(label)}</strong><p>${esc(description)}</p>
      ${route?`<button type="button" data-pr1="navigate" data-to="${route}">Открыть раздел</button>`:''}</div></li>`).join('');
    let modeWarning='';
    if(mismatch){
      modeWarning=`<div class="pr1-alert" role="alert"><strong>Сейчас выбран другой учебный вариант.</strong><p>${esc(activeVariant(saved))}.</p><p>Для ПР № 1 нужен ТР-УЧ-01 v1.0 и кейс нагрева. Результаты других редакций и ваши ответы не будут удалены. Предыдущий активный сценарий можно восстановить.</p><button type="button" class="pr1-switch-btn" data-pr1="switch">Переключить на ТР-УЧ-01 v1.0</button></div>`;
    } else if(saved?.pr1PreviousContext){
      modeWarning='<div class="pr1-notice"><span>Предыдущий учебный вариант сохранён.</span> <button type="button" data-pr1="restore">Вернуться к прежнему варианту</button></div>';
    }
    const result=!p.sessionValid?'<p class="pr1-alert">Сессия не сохранена. Перейдите к заданиям MetalLab или проверьте доступность локального хранилища браузера.</p>':
      (!p.studentKnown?'<p class="pr1-alert">В разделе «Мои результаты» заполните имя и группу.</p>':'');
    const panel=document.querySelector('#pr1Panel');
    panel.querySelector('.pr1-body').innerHTML=`
      <div class="pr1-head"><div><div class="pr1-kicker">ОП.10 · ТЕМА 1.2</div><h2 id="pr1Title">Практическая работа № 1</h2><p>Технологический регламент → требования → тесты → доказательство дефекта</p></div><button type="button" class="pr1-close" data-pr1="close" aria-label="Закрыть">×</button></div>
      <div class="pr1-subline"><strong>ТР-УЧ-01 v1.0</strong><span class="pr1-step-count">${done}/6 этапов по контрольному перечню</span></div>
      <div class="pr1-progress" role="progressbar" aria-label="Выполнено этапов" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${done}"><span style="width:${done/6*100}%"></span></div>
      ${modeWarning}${result}<p class="pr1-muted" id="pr1ReportStatus">${p.ready?'Проверка полноты пройдена. Смысл ответов оценивает преподаватель.':'Отчёт пока будет отмечен как черновик. '+(!p.checked?'После изменения мастерской нажмите «Проверить работу».':'')}</p>
      <ol class="pr1-steps">${rows}</ol>
      <div class="pr1-box"><label class="pr1-check"><input type="checkbox" id="pr1Read" ${notes.read?'checked':''}> Я изучил(а) исходный регламент ТР-УЧ-01 v1.0</label></div>
      <div class="pr1-box"><label for="pr1Conclusion"><strong>Вывод (3–5 предложений)</strong></label><textarea id="pr1Conclusion" rows="4" maxlength="1800" placeholder="Объясните, какие правила регламента были преобразованы в требования и как они проверялись.">${esc(notes.conclusion||'')}</textarea><button type="button" data-pr1="save">Сохранить вывод</button><span class="pr1-autosave"> Изменения сохраняются автоматически.</span></div>
      ${warning?`<p class="pr1-alert" role="alert">${esc(warning)}</p>`:''}
      <div class="pr1-actions"><button type="button" data-pr1="export">Скачать отчёт ПР1 (JSON)</button><button type="button" data-pr1="print">Отчёт для печати / PDF</button><button type="button" class="pr1-secondary" data-pr1="navigate" data-to="results">Мои результаты</button><button type="button" class="pr1-secondary" data-pr1="clear">Очистить отметку и вывод</button></div>
      <p class="pr1-foot">Данные остаются в браузере. Экспорт не отправляет их преподавателю. Перед началом новой работы сохраните отчёт.</p>`;
    refreshIndicators();
  }
  function open(){draw();const el=document.querySelector('#pr1Panel');el.hidden=false;document.body.classList.add('pr1-panel-open');el.querySelector('.pr1-close').focus();}
  function close(){const el=document.querySelector('#pr1Panel');el.hidden=true;document.body.classList.remove('pr1-panel-open');document.querySelector('#pr1Launcher').focus();}
  function visit(view){
    if(['regulation','workshop','logic'].includes(view) && differs(session())){warning='Для выполнения ПР № 1 сначала переключитесь на ТР-УЧ-01 v1.0.';draw();return;}
    close();location.hash='#'+view;
  }
  function capture(){
    const panel=document.querySelector('#pr1Panel');
    notes.conclusion=(panel.querySelector('#pr1Conclusion')?.value||'').slice(0,1800);
    notes.read=!!panel.querySelector('#pr1Read')?.checked;
    notes.owner=owner(session());
    return saveNotes();
  }
  function safeFileName(s){const normalized=String(s||'student').trim().replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,60);return normalized||'student';}
  function downloadReport(data){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
    a.download=`PR1_${safeFileName(data.student)}${data.status==='draft'?'_CHERNOVIK':''}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const cell=text=>`<td>${esc(text)}</td>`;
  const statusNames={ready:'Готова',range:'Вне диапазона',missing:'Нет данных',unreliable:'Недостоверно'};
  const formatVal=value=>value===null||value===undefined?'—':String(value);
  function printable(data){
    const p=data.parameter||{};
    const paramRows=[['Название',p.name],['Точка измерения',p.point],['Единица',p.unit],['Нижняя граница',p.min],['Верхняя граница',p.max],['Допустимый возраст, с',p.maxAge],['Границы включены',p.inclusive?'Да':'Нет'],['Проверки',`Наличие: ${p.checkMissing?'да':'нет'}; качество: ${p.checkQuality?'да':'нет'}; свежесть: ${p.checkFreshness?'да':'нет'}`],['Реакция ПО',p.reaction]].map(([a,b])=>`<tr>${cell(a)}${cell(formatVal(b))}</tr>`).join('');
    const reqRows=data.requirements.map(r=>`<tr>${cell(r.id)}${cell(r.source)}${cell(r.text)}</tr>`).join('');
    // Four columns instead of eight: readable on A4, no rotated pages.
    const testRows=data.tests.map(t=>`<tr>${cell(t.id)}${cell(`${t.missing?'Нет значения':formatVal(t.value)+' °C'}; ${t.quality}; ${formatVal(t.age)} с`)}${cell(`Ожидалось: ${statusNames[t.expected]||formatVal(t.expected)}; расчёт: ${statusNames[t.actual]||formatVal(t.actual)}`)}${cell(`${t.requirement}; ${t.consistent?'Совпало':'Ошибка'}`)}</tr>`).join('');
    const def=data.defect;
    const draft=data.status==='draft' ? `<p class="pr1-draft-banner"><strong>ЧЕРНОВИК — работа не завершена.</strong> ${esc(data.draftReasons.slice(0,3).join('; '))}${data.draftReasons.length>3?' и другие незавершённые этапы.':''}</p>`:'<p class="pr1-complete-banner">Структурная проверка завершена; преподаватель оценивает содержание ответов.</p>';
    return `<article class="pr1-report"><h1>Практическая работа № 1</h1><p>ОП.10 «Основы металлургического производства» · Тема 1.2</p>${draft}<p><b>Студент, группа:</b> ${esc(data.student||'Не указано')}<br><b>Регламент:</b> ТР-УЧ-01, редакция 1.0</p>
      <h2>Карточка параметра</h2><table><tbody>${paramRows}</tbody></table>
      <h2>Функциональные требования</h2><table><thead><tr><th>Код</th><th>Источник</th><th>Формулировка</th></tr></thead><tbody>${reqRows}</tbody></table>
      <h2>Собственные тесты</h2><table class="pr1-test-table"><thead><tr><th>Тест</th><th>Исходные данные</th><th>Ожидаемый и расчётный статус</th><th>Связь и результат</th></tr></thead><tbody>${testRows}</tbody></table>
      <h2>Доказательство дефекта</h2><p>${def?`Вариант: ${esc(def.id)}. ${esc(def.explanation)}`:'Проверенное доказательство в отчёте не обнаружено.'}</p>
      <h2>Вывод</h2><p>${esc(data.conclusion||'Не заполнен.')}</p>
      <h2>Оценка преподавателя</h2><p>Параметры: __ / 2. Требования: __ / 4. Тесты: __ / 2. Дефект: __ / 1. Отчёт и вывод: __ / 1.</p><p><b>Итог:</b> __ / 10. <b>Оценка:</b> _____</p>
      <p class="pr1-print-note">Все значения учебные. Автоматическая проверка не заменяет оценку преподавателя.</p></article>`;
  }
  function printReport(data){
    const mount=document.querySelector('#pr1PrintContent');mount.innerHTML=printable(data);
    document.body.classList.add('pr1-printing');window.print();
  }
  function askDraft(data,verb){
    return data.status==='complete' || window.confirm('Практическая работа ещё не завершена. '+data.draftReasons.slice(0,2).join('; ')+'. '+verb+' черновик?');
  }
  function init(){
    if(document.querySelector('#pr1Launcher'))return;
    const launcher=document.createElement('button');launcher.type='button';launcher.id='pr1Launcher';launcher.setAttribute('aria-haspopup','dialog');launcher.innerHTML='<span>Практическая № 1</span> <span class="pr1-launch-count">0/6</span>';document.body.appendChild(launcher);
    const sidebar=document.querySelector('.sidebar-nav');
    if(sidebar){const btn=document.createElement('button');btn.type='button';btn.className='nav-item pr1-sidebar';btn.id='pr1Sidebar';btn.textContent='Практическая № 1 · 90 мин';sidebar.appendChild(btn);btn.addEventListener('click',open);}
    const panel=document.createElement('div');panel.id='pr1Panel';panel.className='pr1-modal';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','pr1Title');panel.hidden=true;panel.innerHTML='<div class="pr1-backdrop" data-pr1="close"></div><div class="pr1-body" tabindex="-1"></div>';document.body.appendChild(panel);
    const print=document.createElement('div');print.id='pr1PrintContent';document.body.appendChild(print);
    launcher.addEventListener('click',open);
    panel.addEventListener('input',function(e){if(e.target.id==='pr1Conclusion'){capture();refreshIndicators();}});
    panel.addEventListener('change',function(e){if(e.target.id==='pr1Read'){capture();refreshIndicators();}});
    panel.addEventListener('click',function(e){
      const el=e.target.closest('[data-pr1]');if(!el)return;
      const action=el.dataset.pr1;
      if(action==='close'){close();return;}
      if(action==='switch'){window.dispatchEvent(new Event('metallab:pr1-select-base'));return;}
      if(action==='restore'){window.dispatchEvent(new Event('metallab:pr1-restore-context'));return;}
      if(action==='navigate'){visit(el.dataset.to);return;}
      if(action==='clear'){
        if(window.confirm('Очистить только отметку чтения и вывод ПР1? Данные основной программы MetalLab сохранятся.')){
          notes=emptyNotes(owner(session()));saveNotes();draw();
        }return;
      }
      if(['save','export','print'].includes(action)){
        const saved=capture();if(!saved){draw();return;}
        const data=C.createReport(session(),notes);
        if(action==='export' && !askDraft(data,'Скачать')){draw();return;}
        if(action==='print' && !askDraft(data,'Распечатать')){draw();return;}
        draw();
        if(action==='export')downloadReport(data);
        if(action==='print')printReport(data);
      }
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close();});
    window.addEventListener('afterprint',()=>document.body.classList.remove('pr1-printing'));
    window.addEventListener('metallab:pr1-reset',()=>{notes=emptyNotes();saveNotes();if(!panel.hidden)draw();else refreshIndicators();});
    window.addEventListener('metallab:pr1-context-updated',e=>{if(e.detail?.ok){warning='';if(!panel.hidden)draw();else refreshIndicators();}else{warning=e.detail?.message||'Не удалось переключить учебный вариант.';if(!panel.hidden)draw();}});
    window.addEventListener('storage',e=>{if(e.key===NOTES_KEY)notes=read(NOTES_KEY)||emptyNotes();if([NOTES_KEY,SESSION_KEY].includes(e.key)){if(!panel.hidden)draw();else refreshIndicators();}});
    draw();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
