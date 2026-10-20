
(function integratedConsistencyModule(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const statusLabelsLocal={employed:'재직',leave:'휴직',long_trip:'해외출장',overseas:'해외출장',china_expat:'중국주재원',non_regular:'비상근',retired:'퇴사'};
  state.retiredEmployeeSelected=state.retiredEmployeeSelected||new Set();

  // ---------------------------------------------------------------
  // Education navigation and sorting
  // ---------------------------------------------------------------
  function regularContext(){try{return state.currentView==='education'&&categoryMeta(state.selectedCategoryId).type==='regular'}catch(_){return false}}
  function applyEducationPanel(panel){
    const selected='list';
    if(selected==='monthly'&&!regularContext())return applyEducationPanel('list');
    state.educationPanel=selected;
    const list=$('educationListPanel'),monthly=$('educationMonthlyPanel'),button=$('regularHalfYearImportButton'),add=$('addEducationButton');
    if(list)list.hidden=selected!=='list';if(monthly)monthly.hidden=selected!=='monthly';
    if(button){button.textContent=selected==='monthly'?'교육자료 보기':'월별 교육 조회';button.setAttribute('aria-pressed',String(selected==='monthly'))}
    if(add)add.hidden=!(state.isAdmin&&state.currentView==='education'&&selected==='list');
    if(selected==='monthly'&&typeof loadMonthlyEducationHistory==='function')loadMonthlyEducationHistory();
  }
  window.setEducationPanel=setEducationPanel=applyEducationPanel;
  function syncEducationTopAction(){
    const button=$('regularHalfYearImportButton');if(!button)return;
    const visible=Boolean(state.isAdmin&&regularContext());button.hidden=!visible;
    if(!visible&&state.educationPanel==='monthly')applyEducationPanel('list');
    if(visible)button.textContent=state.educationPanel==='monthly'?'교육자료 보기':'월별 교육 조회';
  }
  const topButton=$('regularHalfYearImportButton');if(topButton)topButton.onclick=()=>applyEducationPanel(state.educationPanel==='monthly'?'list':'monthly');
  const baseShow=window.showView||showView;
  window.showView=showView=function(name){const out=baseShow(name);syncEducationTopAction();return out};
  const baseSelect=window.selectCategory||selectCategory;
  window.selectCategory=selectCategory=function(category){
    if(categoryMeta(category?.id).type!=='regular')state.educationPanel='list';
    const out=baseSelect(category);applyEducationPanel(state.educationPanel||'list');syncEducationTopAction();return out;
  };

  function categoryChildrenLocal(rootId){return (state.categories||[]).filter(item=>Number(item.parent_id)===Number(rootId))}
  function educationDateLocal(item){return String(item?.first_session_date||item?.conducted_date||item?.second_session_date||item?.individual_start_date||item?.updated_at||'')}
  function educationRowsLocal(){
    const selected=(state.categories||[]).find(item=>Number(item.id)===Number(state.selectedCategoryId));if(!selected)return [];
    const children=categoryChildrenLocal(selected.id),type=categoryMeta(selected.id).type,aggregate=!selected.parent_id&&children.length&&type==='special';
    const ids=new Set(aggregate?[Number(selected.id),...children.map(x=>Number(x.id))]:[Number(selected.id)]);
    return (state.educationLinks||[]).filter(item=>ids.has(Number(item.category_id))).sort((a,b)=>educationDateLocal(b).localeCompare(educationDateLocal(a),'ko')||Number(b.id||0)-Number(a.id||0));
  }
  function renderEducationHeaderLocal(type){
    const colgroup=$('educationColgroup'),head=$('educationTableHeader'),table=$('educationDataTable');if(!colgroup||!head)return;
    colgroup.replaceChildren();head.replaceChildren();table.dataset.educationType=type;
    const columns=type==='regular'?[['no','No.'],['date','실시일'],['title','교육명'],['topic','교육 주제'],['material','교육자료'],['report','결과보고서']]:[['no','No.'],['date','실시일'],['category','교육 구분'],['title','교육명'],['report','결과보고서']];
    if(state.isAdmin)columns.push(['manage','관리']);
    columns.forEach(([key,label])=>{const col=document.createElement('col');col.className=`education-col-${key}`;colgroup.appendChild(col);const th=document.createElement('th');th.scope='col';th.className='center';th.textContent=label;head.appendChild(th)});
  }
  window.renderEducationTable=renderEducationTable=function(){
    syncEducationTopAction();
    const body=$('educationTableBody');if(!body)return;body.replaceChildren();
    const type=categoryMeta(state.selectedCategoryId).type;renderEducationHeaderLocal(type);
    const all=educationRowsLocal(),size=25,pages=Math.max(1,Math.ceil(all.length/size));state.educationUnifiedPage=Math.min(Math.max(1,state.educationUnifiedPage||1),pages);const start=(state.educationUnifiedPage-1)*size,items=all.slice(start,start+size);
    if(!all.length){setStatus('educationStatus','등록된 자료가 없습니다.');document.getElementById('educationPagination')?.replaceChildren();return}
    setStatus('educationStatus','');const fragment=document.createDocumentFragment();
    items.forEach((item,index)=>{const meta=categoryMeta(item.category_id),tr=document.createElement('tr');addTextCell(tr,start+index+1,'center');const date=addTextCell(tr,scheduleText(item),'center');date.style.whiteSpace='pre-line';
      if(type==='regular'){addTextCell(tr,item.title||'-','center education-text-cell',item.title||'-');addTextCell(tr,item.education_topic||'-','center education-text-cell',item.education_topic||'-');const material=document.createElement('td');material.className='center';if(validUrl(item.web_url)){const a=document.createElement('a');a.className='download-link';a.textContent='교육자료';a.href=item.web_url;a.target='_blank';a.rel='noopener noreferrer';material.appendChild(a)}else material.textContent='-';tr.appendChild(material)}
      else{const categoryLabel=meta.type==='special'?specialEducationDisplayLabel(meta.label):meta.label;addTextCell(tr,categoryLabel,'center education-category-text',categoryLabel);addTextCell(tr,item.title||categoryLabel||'-','center education-text-cell',item.title||categoryLabel||'-')}
      const report=document.createElement('td');report.className='center';if(validUrl(item.result_report_url)){const a=document.createElement('a');a.className='download-link';a.textContent='결과보고서';a.href=item.result_report_url;a.target='_blank';a.rel='noopener noreferrer';report.appendChild(a)}else{const p=document.createElement('span');p.className='progress';p.textContent='보고서 미등록';report.appendChild(p)}tr.appendChild(report);
      if(state.isAdmin){const manage=document.createElement('td');manage.className='center';const actions=document.createElement('div');actions.className='row-actions row-action-group';[...(meta.type==='regular'?[]:[['대상자',()=>openParticipants(item),'mini']]),['수정',()=>openEducationForm(item),'mini'],['삭제',()=>deleteEducation(item),'mini mini-danger']].forEach(([label,handler,cls])=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=handler;actions.appendChild(b)});manage.appendChild(actions);tr.appendChild(manage)}fragment.appendChild(tr)});body.appendChild(fragment);
    let pager=$('educationPagination');if(!pager){pager=document.createElement('div');pager.id='educationPagination';pager.className='platform-pagination';$('educationStatus')?.before(pager)}pager.replaceChildren();if(all.length>size){for(let p=1;p<=pages;p++){const b=document.createElement('button');b.type='button';b.className='platform-page-button'+(p===state.educationUnifiedPage?' active':'');b.textContent=p;b.onclick=()=>{state.educationUnifiedPage=p;renderEducationTable()};pager.appendChild(b)}}
  };

  // ---------------------------------------------------------------
  // Employee roster: active = edit/retire only, retired = bulk delete
  // ---------------------------------------------------------------
  window.renderActiveEmployees=renderActiveEmployees=function(){
    const q=$('activeEmployeeSearch').value.trim().toLowerCase(),filter=$('activeStatusFilter').value;
    const rows=(state.activeEmployees||[]).filter(x=>(!filter||x.employment_status===filter)&&(!q||`${x.employee_name} ${x.department_name} ${x.job_title||''}`.toLowerCase().includes(q))).sort((a,b)=>String(a.department_name||'').localeCompare(String(b.department_name||''),'ko')||String(a.employee_name||'').localeCompare(String(b.employee_name||''),'ko'));
    const info=typeof pageInfo==='function'?pageInfo(rows,'active'):{items:rows,start:0},body=$('activeEmployeeTableBody');body.replaceChildren();
    if(!rows.length){setStatus('activeEmployeeStatus','조건에 맞는 재직자가 없습니다.');return}setStatus('activeEmployeeStatus','');const f=document.createDocumentFragment();
    info.items.forEach((x,index)=>{const tr=document.createElement('tr');const hidden=document.createElement('td');hidden.hidden=true;tr.appendChild(hidden);addTextCell(tr,info.start+index+1,'center');const status=document.createElement('td');status.className='center';status.appendChild(statusBadge(x.employment_status));tr.appendChild(status);addTextCell(tr,x.department_name||'-','center');addTextCell(tr,x.job_title||'-','center');addTextCell(tr,x.employee_name||'-','center');addTextCell(tr,formatDate(x.hire_date),'center');const manage=document.createElement('td');manage.className='center row-actions';const edit=document.createElement('button');edit.type='button';edit.className='mini';edit.textContent='수정';edit.onclick=()=>openEmployeeForm(x);const retire=document.createElement('button');retire.type='button';retire.className='mini mini-warning';retire.textContent='퇴사처리';retire.onclick=()=>openRetireForm([x.employee_id],x.employee_name);manage.append(edit,retire);tr.appendChild(manage);f.appendChild(tr)});body.appendChild(f);if(typeof renderPager==='function')renderPager('activeEmployeePagination',rows.length,'active',renderActiveEmployees);
  };
  function updateRetiredSelection(){const count=state.retiredEmployeeSelected.size;if($('retiredSelectionText'))$('retiredSelectionText').textContent=`선택 ${count}명`;if($('retiredBulkDeleteButton'))$('retiredBulkDeleteButton').disabled=!count;const checks=[...document.querySelectorAll('.retired-row-check')];if($('retiredSelectAll')){$('retiredSelectAll').checked=checks.length>0&&checks.every(x=>x.checked);$('retiredSelectAll').indeterminate=checks.some(x=>x.checked)&&!checks.every(x=>x.checked)}}
  window.renderRetiredEmployees=renderRetiredEmployees=function(){
    const q=$('retiredEmployeeSearch').value.trim().toLowerCase(),dep=$('retiredDepartmentFilter').value;
    const rows=(state.retiredEmployees||[]).filter(x=>(!dep||String(x.department_id)===dep)&&(!q||`${x.employee_name} ${x.department_name} ${x.job_title||''}`.toLowerCase().includes(q))).sort((a,b)=>String(a.department_name||'').localeCompare(String(b.department_name||''),'ko')||String(a.employee_name||'').localeCompare(String(b.employee_name||''),'ko'));
    const info=typeof pageInfo==='function'?pageInfo(rows,'retired'):{items:rows,start:0},body=$('retiredEmployeeTableBody');body.replaceChildren();if(!rows.length){setStatus('retiredEmployeeStatus','조건에 맞는 퇴사자가 없습니다.');updateRetiredSelection();return}setStatus('retiredEmployeeStatus','');const f=document.createDocumentFragment();
    info.items.forEach((x,index)=>{const tr=document.createElement('tr');const selectTd=document.createElement('td');selectTd.className='center';const check=document.createElement('input');check.type='checkbox';check.className='retired-row-check';check.value=x.employee_id;check.checked=state.retiredEmployeeSelected.has(String(x.employee_id));check.onchange=()=>{check.checked?state.retiredEmployeeSelected.add(String(x.employee_id)):state.retiredEmployeeSelected.delete(String(x.employee_id));updateRetiredSelection()};selectTd.appendChild(check);tr.appendChild(selectTd);addTextCell(tr,info.start+index+1,'center');addTextCell(tr,x.department_name||'-','center');addTextCell(tr,x.job_title||'-','center');addTextCell(tr,x.employee_name||'-','center');addTextCell(tr,formatDate(x.hire_date),'center');const td=document.createElement('td');td.className='center';const input=document.createElement('input');input.type='date';input.className='retirement-date-editor';input.value=String(x.retirement_date||'').slice(0,10);input.onchange=()=>saveRetirementDate(x,input);td.appendChild(input);tr.appendChild(td);const status=document.createElement('td');status.className='center';status.appendChild(statusBadge('retired'));tr.appendChild(status);const manage=document.createElement('td');manage.className='center row-actions';const history=document.createElement('button');history.type='button';history.className='mini';history.textContent='교육이력';history.onclick=()=>openRetiredHistory(x);manage.appendChild(history);tr.appendChild(manage);f.appendChild(tr)});body.appendChild(f);if(typeof renderPager==='function')renderPager('retiredEmployeePagination',rows.length,'retired',renderRetiredEmployees);updateRetiredSelection();
  };
  $('retiredSelectAll')?.addEventListener('change',event=>{document.querySelectorAll('.retired-row-check').forEach(input=>{input.checked=event.target.checked;input.checked?state.retiredEmployeeSelected.add(String(input.value)):state.retiredEmployeeSelected.delete(String(input.value))});updateRetiredSelection()});
  async function deleteRetiredSelected(){const ids=[...state.retiredEmployeeSelected].map(Number);if(!ids.length)return;if(!confirm(`선택한 퇴사자 ${ids.length}명과 연결된 모든 자료를 영구 삭제하시겠습니까?`))return;const button=$('retiredBulkDeleteButton'),old=button.textContent;button.disabled=true;button.textContent='삭제 중';try{let result=await db.rpc('hard_delete_employees',{p_employee_ids:ids,p_force:true});if(result.error){for(const id of ids){const one=await db.rpc('hard_delete_employee',{p_employee_id:id,p_force:true});if(one.error)throw one.error}}state.retiredEmployeeSelected.clear();state.employeeRostersLoaded=false;state.monthlyHistoryLoaded=false;await Promise.allSettled([loadAllEmployeeRosters(),loadPublicData()]);showToast(`${ids.length}명의 퇴사자를 완전 삭제했습니다.`)}catch(error){console.error('[퇴사자 일괄 삭제]',error);showToast(friendlyErrorMessage(error,'퇴사자 삭제'))}finally{button.textContent=old;updateRetiredSelection()}}
  if($('retiredBulkDeleteButton'))$('retiredBulkDeleteButton').onclick=deleteRetiredSelected;
  if($('addEmployeeButton'))$('addEmployeeButton').onclick=()=>{fillEmployeeDepartmentOptions();openEmployeeForm()};

  // ---------------------------------------------------------------
  // Employment status history and monthly synchronization
  // ---------------------------------------------------------------
  async function upsertStatusHistory(employeeId,status,effectiveFrom,note){if(!employeeId||!effectiveFrom)return;const result=await db.rpc('upsert_employee_monthly_status',{p_employee_id:Number(employeeId),p_status:status,p_effective_from:effectiveFrom,p_note:note||null});if(result.error)console.warn('[월별 근무상태 이력 저장]',result.error)}
  function invalidateMonthly(){state.monthlyHistoryLoaded=false;state.monthlyHistoryRows=[];state.monthlyHistoryMonths=[]}
  const baseSaveEmployee=window.saveEmployee||saveEmployee;
  window.saveEmployee=saveEmployee=async function(event){await baseSaveEmployee(event);if($('employeeFormError')?.textContent)return;invalidateMonthly();await loadPublicData()};
  const baseRetire=window.processRetirement||processRetirement;
  window.processRetirement=processRetirement=async function(event){const ids=String($('retireEmployeeIds')?.value||'').split(',').filter(Boolean).map(Number),date=$('retirementDateInput')?.value;await baseRetire(event);if($('retireError')?.textContent)return;await Promise.all(ids.map(id=>upsertStatusHistory(id,'retired',date,$('retirementNote')?.value.trim()||null)));invalidateMonthly();await loadPublicData()};
  const baseSaveRetirement=window.saveRetirementDate||saveRetirementDate;
  window.saveRetirementDate=saveRetirementDate=async function(employee,input){await baseSaveRetirement(employee,input);if(String(employee.retirement_date||'').slice(0,10)===String(input.value||'').slice(0,10)){await upsertStatusHistory(employee.employee_id,'retired',input.value,employee.note||null);invalidateMonthly()}};

  async function loadStatusPeriods(year){
    const from=`${year}-01-01`,to=`${year}-12-31`;const result=await db.from('employee_monthly_status_history').select('employee_id,status,effective_from,effective_to,note').lte('effective_from',to).or(`effective_to.is.null,effective_to.gte.${from}`).order('effective_from');if(result.error){console.warn('[월별 근무상태 이력 조회]',result.error);return []}return result.data||[];
  }
  function monthWithin(month,period){const start=String(period.effective_from||'').slice(0,7),end=period.effective_to?String(period.effective_to).slice(0,7):'9999-12';return month>=start&&month<=end}
  function ensureMonthlyEntry(row,month){let entry=row.months.get(month);if(!entry){entry={dates:new Set(),excluded:false,incomplete:false,reasons:new Set(),linkId:null,participantId:null,updatedAt:null};row.months.set(month,entry)}return entry}
  async function attachStatusPeriods(){
    const year=$('monthlyHistoryYear')?.value||String(new Date().getFullYear());let periods=await loadStatusPeriods(year);
    if(!periods.length){let roster=[...(state.activeEmployees||[]),...(state.retiredEmployees||[])];if(!roster.length&&state.isAdmin){const results=await Promise.all([db.rpc('get_admin_employee_roster',{p_roster:'active'}),db.rpc('get_admin_employee_roster',{p_roster:'retired'})]);roster=[...(results[0].data||[]),...(results[1].data||[])]}periods=roster.filter(x=>x.employment_status&&x.employment_status!=='employed').map(x=>({employee_id:x.employee_id,status:x.employment_status,effective_from:x.department_effective_date||x.hire_date||`${year}-01-01`,effective_to:x.retirement_date||null}))}
    const map=new Map();periods.forEach(p=>{const key=String(p.employee_id);if(!map.has(key))map.set(key,[]);map.get(key).push(p)});
    (state.monthlyHistoryRows||[]).forEach(row=>{row.statusPeriods=map.get(String(row.employee_id))||[];for(const [month,entry] of row.months){if(entry.derivedStatus){entry.excluded=false;entry.reasons=new Set();entry.derivedStatus=false}}for(let m=1;m<=12;m++){const month=`${year}-${String(m).padStart(2,'0')}`,period=row.statusPeriods.find(p=>monthWithin(month,p));if(!period||period.status==='employed'||period.status==='retired')continue;const entry=ensureMonthlyEntry(row,month);if(entry.dates?.size||entry.incomplete||entry.excluded)continue;entry.excluded=true;entry.derivedStatus=true;entry.reasons=new Set([statusLabelsLocal[period.status]||period.status])}})
  }
  const baseLoadMonthly=window.loadMonthlyEducationHistory||loadMonthlyEducationHistory;
  window.loadMonthlyEducationHistory=loadMonthlyEducationHistory=async function(force=false){await baseLoadMonthly(force);await attachStatusPeriods();renderMonthlyEducationHistory()};
  $('monthlyHistoryYear')?.addEventListener('change',async()=>{await attachStatusPeriods();renderMonthlyEducationHistory()});

  function ensureMonthlyStatusDate(){const editor=$('monthlyTopEditor');if(!editor||$('monthlyStatusEffectiveDate'))return;const wrap=document.createElement('div');wrap.className='monthly-status-date-wrap';wrap.hidden=true;wrap.innerHTML='<label for="monthlyStatusEffectiveDate">상태 적용일</label><input id="monthlyStatusEffectiveDate" type="date">';const save=$('monthlyTopSave');editor.insertBefore(wrap,save);const reason=$('monthlyTopReason');reason?.addEventListener('change',syncMonthlyStatusDate);document.addEventListener('click',event=>{const td=event.target.closest?.('#monthlyHistoryBody td.month-selectable');if(!td)return;const tr=td.parentElement,cells=[...tr.children],idx=cells.indexOf(td),year=$('monthlyHistoryYear')?.value;if(idx>=2&&year){state.monthlyStatusContext={employeeName:cells[1]?.textContent,departmentName:cells[0]?.textContent,month:`${year}-${String(idx-1).padStart(2,'0')}`};syncMonthlyStatusDate()}},true)}
  function syncMonthlyStatusDate(){const wrap=$('monthlyStatusEffectiveDate')?.parentElement,reason=$('monthlyTopReason')?.value,month=state.monthlyStatusContext?.month;if(!wrap||!month)return;const needs=['retired','leave','overseas','china_expat','non_regular'].includes(reason);wrap.hidden=!needs;if(needs){const [y,m]=month.split('-').map(Number);$('monthlyStatusEffectiveDate').value=reason==='retired'?new Date(y,m,0).toISOString().slice(0,10):`${month}-01`}}
  ensureMonthlyStatusDate();
  window.onMonthlyEmploymentStatusSaved=async function({row,month,reason,clear}){try{const normalized=clear?'employed':reason;if(!['employed','retired','leave','overseas','china_expat','non_regular'].includes(normalized))return;const effective=$('monthlyStatusEffectiveDate')?.value||`${month}-01`;if(normalized==='retired'){const result=await db.rpc('retire_employee',{p_employee_id:Number(row.employee_id),p_retirement_date:effective,p_note:'월별 교육 조회 연동'});if(result.error)throw result.error}else{let roster=[...(state.activeEmployees||[]),...(state.retiredEmployees||[])];let employee=roster.find(x=>Number(x.employee_id)===Number(row.employee_id));if(!employee){const result=await db.rpc('get_admin_employee_roster',{p_roster:'active'});employee=(result.data||[]).find(x=>Number(x.employee_id)===Number(row.employee_id))}if(employee){const result=await db.rpc('save_employee_profile_v3',{p_employee_id:Number(employee.employee_id),p_employee_code:employee.employee_code||`AUTO-${employee.employee_id}`,p_employee_name:employee.employee_name,p_department_id:Number(employee.department_id),p_job_title:employee.job_title||'',p_department_effective_date:effective,p_employment_status:normalized==='overseas'?'long_trip':normalized,p_hire_date:employee.hire_date||null,p_note:employee.note||null});if(result.error)throw result.error}}await upsertStatusHistory(row.employee_id,normalized==='overseas'?'long_trip':normalized,effective,'월별 교육 조회 연동');state.employeeRostersLoaded=false;invalidateMonthly();await Promise.allSettled([loadAllEmployeeRosters(),loadPublicData()])}catch(error){console.error('[월별 근무상태 연동]',error);showToast('교육 비대상은 저장됐지만 사원명부 근무상태 연동에 실패했습니다.')}};

  // ---------------------------------------------------------------
  // Self-history half-year selector as a list (select)
  // ---------------------------------------------------------------
  function convertHalfSelector(){const box=$('selfHistoryHalfPagination');if(!box||box.dataset.converting==='1')return;const buttons=[...box.querySelectorAll('.platform-page-button')];if(buttons.length<=1)return;const activeIndex=Math.max(0,buttons.findIndex(button=>button.classList.contains('active'))),signature=`${buttons.map(button=>button.textContent.trim()).join('|')}@${activeIndex}`;let select=$('selfHistoryHalfSelect');if(select&&box.dataset.halfSignature===signature&&select.options.length===buttons.length)return;box.dataset.converting='1';if(!select){select=document.createElement('select');select.id='selfHistoryHalfSelect';select.setAttribute('aria-label','반기 선택');box.prepend(select)}select.replaceChildren();buttons.forEach((button,index)=>{const option=new Option(button.textContent,String(index));option.selected=index===activeIndex;select.appendChild(option)});select.onchange=()=>buttons[Number(select.value)]?.click();box.dataset.halfSignature=signature;box.classList.add('as-select');delete box.dataset.converting}
  const halfBox=$('selfHistoryHalfPagination');if(halfBox)new MutationObserver(convertHalfSelector).observe(halfBox,{childList:true,subtree:true});

  // ---------------------------------------------------------------
  function refreshIntegratedCategoryMenu(){if((state.categories||[]).length){renderCategoryMenu();updateCategoryActive?.();syncEducationTopAction();}}
  refreshIntegratedCategoryMenu();
  setTimeout(refreshIntegratedCategoryMenu,0);
  setTimeout(refreshIntegratedCategoryMenu,300);
  syncEducationTopAction();applyEducationPanel(state.educationPanel||'list');convertHalfSelector();
})();
