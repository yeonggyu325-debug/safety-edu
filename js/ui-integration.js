"use strict";
(function listAndPagingModule(){
  "use strict";
  const PAGE_SIZE=50;
  const paging={education:1,active:1,retired:1,employeePicker:1,participants:1};
  window.platformPaging=paging;
  state.activeEmployeeSelected=state.activeEmployeeSelected||new Set();
  state.attendancePageSize=PAGE_SIZE;
  function ensurePager(id,anchorId){
    let box=document.getElementById(id);
    if(box)return box;
    const anchor=document.getElementById(anchorId);
    if(!anchor)return null;
    box=document.createElement('div');
    box.id=id;box.className='platform-pagination';box.hidden=true;
    anchor.insertAdjacentElement('afterend',box);
    return box;
  }

  function pageInfo(rows,key){
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    paging[key]=Math.min(Math.max(1,paging[key]||1),pages);
    const start=(paging[key]-1)*PAGE_SIZE;
    return {page:paging[key],pages,start,items:rows.slice(start,start+PAGE_SIZE)};
  }

  function renderPager(id,total,key,renderFn){
    const box=document.getElementById(id);if(!box)return;
    const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
    paging[key]=Math.min(Math.max(1,paging[key]||1),pages);
    box.replaceChildren();
    if(total<=PAGE_SIZE){box.hidden=true;return}
    box.hidden=false;
    const summary=document.createElement('span');summary.className='platform-page-summary';summary.textContent=`총 ${total}건 · ${paging[key]}/${pages}페이지`;box.appendChild(summary);
    const add=(label,page,{active=false,disabled=false}={})=>{
      const button=document.createElement('button');button.type='button';button.className='platform-page-button'+(active?' active':'');button.textContent=label;button.disabled=disabled;
      if(!disabled&&!active)button.onclick=()=>{paging[key]=page;renderFn();const target=box.closest('.card,.panel')||box;target.scrollIntoView({block:'nearest'});};
      box.appendChild(button);
    };
    add('이전',paging[key]-1,{disabled:paging[key]===1});
    for(let page=1;page<=pages;page++)add(String(page),page,{active:page===paging[key]});
    add('다음',paging[key]+1,{disabled:paging[key]===pages});
  }

  ensurePager('educationPagination','educationStatus');
  ensurePager('activeEmployeePagination','activeEmployeeStatus');
  ensurePager('retiredEmployeePagination','retiredEmployeeStatus');
  ensurePager('employeePickerPagination','employeePickerList');
  ensurePager('participantPagination','participantStatus');
  const originalSelectCategory=selectCategory;
  window.selectCategory=function(category){paging.education=1;return originalSelectCategory(category)};
  window.renderEducationTable=function(){
    const halfYearButton=$('regularHalfYearImportButton');if(halfYearButton)halfYearButton.hidden=!(state.isAdmin&&state.currentView==='education'&&categoryMeta(state.selectedCategoryId).type==='regular');
    const body=$('educationTableBody');body.replaceChildren();
    const selectedMeta=categoryMeta(state.selectedCategoryId);renderEducationHeader(selectedMeta.type);
    const rows=state.educationLinks.filter(x=>Number(x.category_id)===Number(state.selectedCategoryId));
    const info=pageInfo(rows,'education');
    if(!rows.length){setStatus('educationStatus','등록된 교육자료가 없습니다.');renderPager('educationPagination',0,'education',renderEducationTable);return}
    setStatus('educationStatus','');const f=document.createDocumentFragment();
    info.items.forEach((item,index)=>{
      const meta=categoryMeta(item.category_id),tr=document.createElement('tr');addTextCell(tr,info.start+index+1,'center');
      const schedule=addTextCell(tr,scheduleText(item),'center');schedule.style.whiteSpace='pre-line';
      if(meta.type==='regular'){
        addTextCell(tr,item.title||'-','center ellipsis',item.title||'-');addTextCell(tr,item.education_topic||'-','center ellipsis',item.education_topic||'-');
        const material=document.createElement('td');material.className='center';
        if(validUrl(item.web_url)){const a=document.createElement('a');a.className='download-link';a.textContent='교육자료';a.href=item.web_url;a.target='_blank';a.rel='noopener noreferrer';material.appendChild(a)}else material.textContent='-';tr.appendChild(material);
      }else{
        const categoryLabel=meta.type==='special'?specialEducationDisplayLabel(meta.label):meta.label;
        const categoryCell=addTextCell(tr,categoryLabel,'center education-category-text',categoryLabel);
        categoryCell.dataset.categoryKind=meta.type;
      }
      const report=document.createElement('td');report.className='center';
      if(validUrl(item.result_report_url)){const a=document.createElement('a');a.className='download-link';a.textContent='결과보고서';a.href=item.result_report_url;a.target='_blank';a.rel='noopener noreferrer';report.appendChild(a)}else{const p=document.createElement('span');p.className='progress';p.textContent='보고서 미등록';report.appendChild(p)}tr.appendChild(report);
      if(state.isAdmin){const manage=document.createElement('td');manage.className='center education-manage-cell';const actions=document.createElement('div');actions.className='row-actions row-action-group';const target=document.createElement('button');target.className='mini';target.textContent='대상자';target.onclick=()=>openParticipants(item);const edit=document.createElement('button');edit.type='button';edit.className='mini';edit.textContent='수정';edit.onclick=()=>openEducationForm(item);const del=document.createElement('button');del.className='mini mini-danger';del.textContent='삭제';del.onclick=()=>deleteEducation(item);actions.append(target,edit,del);manage.appendChild(actions);tr.appendChild(manage)}
      f.appendChild(tr);
    });body.appendChild(f);renderPager('educationPagination',rows.length,'education',renderEducationTable);
  };

  window.resetActiveSelection=function(){state.activeEmployeeSelected.clear();$('selectAllActiveEmployees').checked=false;$('selectAllActiveEmployees').indeterminate=false;$('activeSelectionText').textContent='선택 0명';$('bulkDeleteButton').disabled=true};

  window.updateActiveSelection=function(){
    document.querySelectorAll('.active-row-check').forEach(input=>{input.checked?state.activeEmployeeSelected.add(String(input.value)):state.activeEmployeeSelected.delete(String(input.value))});
    const checks=[...document.querySelectorAll('.active-row-check')],selectedVisible=checks.filter(x=>x.checked);
    $('activeSelectionText').textContent=`선택 ${state.activeEmployeeSelected.size}명`;$('bulkDeleteButton').disabled=!state.activeEmployeeSelected.size;
    $('selectAllActiveEmployees').checked=checks.length>0&&selectedVisible.length===checks.length;$('selectAllActiveEmployees').indeterminate=selectedVisible.length>0&&selectedVisible.length<checks.length;
  };

  window.renderActiveEmployees=function(){
    const q=$('activeEmployeeSearch').value.trim().toLowerCase(),filter=$('activeStatusFilter').value;
    const rows=state.activeEmployees.filter(x=>(!filter||x.employment_status===filter)&&(!q||`${x.employee_name} ${x.department_name} ${x.job_title||''}`.toLowerCase().includes(q))).sort((a,b)=>String(a.department_name||'').localeCompare(String(b.department_name||''),'ko')||String(a.employee_name||'').localeCompare(String(b.employee_name||''),'ko'));
    const validIds=new Set(state.activeEmployees.map(x=>String(x.employee_id)));[...state.activeEmployeeSelected].forEach(id=>{if(!validIds.has(id))state.activeEmployeeSelected.delete(id)});
    const info=pageInfo(rows,'active'),body=$('activeEmployeeTableBody');body.replaceChildren();
    if(!rows.length){setStatus('activeEmployeeStatus','조건에 맞는 재직자가 없습니다.');renderPager('activeEmployeePagination',0,'active',renderActiveEmployees);updateActiveSelection();return}setStatus('activeEmployeeStatus','');
    const f=document.createDocumentFragment();info.items.forEach((x,index)=>{const tr=document.createElement('tr');const checkTd=document.createElement('td');checkTd.className='center';const check=document.createElement('input');check.type='checkbox';check.className='active-row-check';check.value=x.employee_id;check.checked=state.activeEmployeeSelected.has(String(x.employee_id));check.onchange=updateActiveSelection;checkTd.appendChild(check);tr.appendChild(checkTd);addTextCell(tr,info.start+index+1,'center');const statusTd=document.createElement('td');statusTd.appendChild(statusBadge(x.employment_status));tr.appendChild(statusTd);addTextCell(tr,x.department_name,'ellipsis',x.department_name);addTextCell(tr,x.job_title||'-','ellipsis',x.job_title||'-');addTextCell(tr,x.employee_name,'ellipsis',x.employee_name);addTextCell(tr,formatDate(x.hire_date));const manage=document.createElement('td');manage.className='center row-actions';const edit=document.createElement('button');edit.type='button';edit.className='mini';edit.textContent='수정';edit.onclick=()=>openEmployeeForm(x);const retire=document.createElement('button');retire.type='button';retire.className='mini mini-warning';retire.textContent='퇴사처리';retire.onclick=()=>openRetireForm([x.employee_id],x.employee_name);const hardDelete=document.createElement('button');hardDelete.type='button';hardDelete.className='mini mini-danger';hardDelete.textContent='삭제';hardDelete.onclick=()=>openHardDeleteForm(x);manage.append(edit,retire,hardDelete);tr.appendChild(manage);f.appendChild(tr)});body.appendChild(f);renderPager('activeEmployeePagination',rows.length,'active',renderActiveEmployees);updateActiveSelection();
  };

  window.saveRetirementDate=async function(employee,input){
    const next=String(input.value||'').trim(),previous=String(employee.retirement_date||'').slice(0,10),hire=String(employee.hire_date||'').slice(0,10);
    if(!next){input.value=previous;showToast('퇴사일을 입력하세요.');return}
    if(hire&&next<hire){input.value=previous;showToast('퇴사일은 입사일보다 빠를 수 없습니다.');return}
    if(next===previous)return;
    input.disabled=true;input.classList.add('is-saving');input.classList.remove('is-error');
    try{
      let result=await db.from('employees').update({retirement_date:next}).eq('id',Number(employee.employee_id));
      if(result.error){
        const fallback=await db.rpc('retire_employee',{p_employee_id:Number(employee.employee_id),p_retirement_date:next,p_note:employee.note||null});
        if(fallback.error)throw fallback.error;
      }
      employee.retirement_date=next;
      const monthlyRow=(state.monthlyHistoryRows||[]).find(row=>Number(row.employee_id)===Number(employee.employee_id));
      if(monthlyRow)monthlyRow.retirement_date=employee.retirement_date;
      input.value=String(employee.retirement_date).slice(0,10);input.classList.add('is-saved');setTimeout(()=>input.classList.remove('is-saved'),900);
      showToast('퇴사일을 수정했습니다.');
      if(state.educationPanel==='monthly')renderMonthlyEducationHistory();
    }catch(error){
      console.error('[퇴사일 수정]',error);input.value=previous;input.classList.add('is-error');setTimeout(()=>input.classList.remove('is-error'),1200);showToast(friendlyErrorMessage(error,'퇴사일 수정'));
    }finally{input.disabled=false;input.classList.remove('is-saving')}
  };

  window.renderRetiredEmployees=function(){
    const q=$('retiredEmployeeSearch').value.trim().toLowerCase(),dep=$('retiredDepartmentFilter').value;
    const rows=state.retiredEmployees.filter(x=>(!dep||String(x.department_id)===dep)&&(!q||`${x.employee_name} ${x.department_name} ${x.job_title||''}`.toLowerCase().includes(q))).sort((a,b)=>String(a.department_name||'').localeCompare(String(b.department_name||''),'ko')||String(a.employee_name||'').localeCompare(String(b.employee_name||''),'ko'));
    const info=pageInfo(rows,'retired'),body=$('retiredEmployeeTableBody');body.replaceChildren();if(!rows.length){setStatus('retiredEmployeeStatus','조건에 맞는 퇴사자가 없습니다.');renderPager('retiredEmployeePagination',0,'retired',renderRetiredEmployees);return}setStatus('retiredEmployeeStatus','');const f=document.createDocumentFragment();
    info.items.forEach((x,index)=>{const tr=document.createElement('tr');addTextCell(tr,info.start+index+1,'center');addTextCell(tr,x.department_name,'ellipsis',x.department_name);addTextCell(tr,x.job_title||'-','ellipsis',x.job_title||'-');addTextCell(tr,x.employee_name,'ellipsis',x.employee_name);addTextCell(tr,formatDate(x.hire_date));const retirementTd=document.createElement('td');retirementTd.className='center';const retirementInput=document.createElement('input');retirementInput.type='date';retirementInput.className='retirement-date-editor';retirementInput.value=String(x.retirement_date||'').slice(0,10);retirementInput.setAttribute('aria-label',`${x.employee_name} 퇴사일 수정`);retirementInput.addEventListener('change',()=>saveRetirementDate(x,retirementInput));retirementInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveRetirementDate(x,retirementInput)}});retirementTd.appendChild(retirementInput);tr.appendChild(retirementTd);const statusTd=document.createElement('td');statusTd.appendChild(statusBadge('retired'));tr.appendChild(statusTd);const manage=document.createElement('td');manage.className='center';const history=document.createElement('button');history.className='mini';history.textContent='교육이력 확인';history.onclick=()=>openRetiredHistory(x);const hardDelete=document.createElement('button');hardDelete.type='button';hardDelete.className='mini mini-danger';hardDelete.textContent='삭제';hardDelete.onclick=()=>openHardDeleteForm(x);manage.append(history,hardDelete);tr.appendChild(manage);f.appendChild(tr)});body.appendChild(f);renderPager('retiredEmployeePagination',rows.length,'retired',renderRetiredEmployees);
  };

  function employeePickerRows(){
    state.employeePickerSelected=state.employeePickerSelected||new Set();
    const q=$('employeePickerSearch').value.trim().toLowerCase();
    const registered=new Set(state.participants.map(x=>Number(x.employee_id)));
    // 검색어와 관계없는 전체 추가 가능 명단을 기준으로 선택값을 유지합니다.
    // 따라서 검색 결과에서 잠시 사라져도 이전에 체크한 직원은 일괄 추가 대상에 남습니다.
    const candidates=state.currentEmployees.filter(x=>!registered.has(Number(x.employee_id)));
    const valid=new Set(candidates.map(x=>String(x.employee_id)));
    [...state.employeePickerSelected].forEach(id=>{if(!valid.has(id))state.employeePickerSelected.delete(id)});
    return candidates
      .filter(x=>!q||`${x.employee_name||''} ${x.department_name||''}`.toLowerCase().includes(q))
      .sort((a,b)=>String(a.employee_name||'').localeCompare(String(b.employee_name||''),'ko')||String(a.department_name||'').localeCompare(String(b.department_name||''),'ko'));
  }
  window.currentEmployeePickerPageItems=function(){return pageInfo(employeePickerRows(),'employeePicker').items};
  window.updateEmployeePickerSelectionUI=function(){
    const selected=state.employeePickerSelected||new Set(),visible=window.currentEmployeePickerPageItems(),master=$('employeePickerSelectAll'),button=$('addSelectedParticipantsButton');
    $('employeePickerSelectionText').textContent=`선택 ${selected.size}명`;button.disabled=!selected.size;
    const all=visible.length>0&&visible.every(x=>selected.has(String(x.employee_id))),some=visible.some(x=>selected.has(String(x.employee_id)));master.checked=all;master.indeterminate=some&&!all;master.disabled=!visible.length;
  };
  window.renderEmployeePicker=function(){
    const rows=employeePickerRows(),info=pageInfo(rows,'employeePicker'),list=$('employeePickerList');list.replaceChildren();const fragment=document.createDocumentFragment();
    info.items.forEach(x=>{const row=document.createElement('div');row.className='picker-row';const check=document.createElement('input');check.type='checkbox';check.className='employee-picker-check';check.value=String(x.employee_id);check.checked=state.employeePickerSelected.has(check.value);check.setAttribute('aria-label',`${x.employee_name||'직원'} 대상자 선택`);check.onchange=()=>{check.checked?state.employeePickerSelected.add(check.value):state.employeePickerSelected.delete(check.value);updateEmployeePickerSelectionUI()};const name=document.createElement('span');name.className='picker-name';name.textContent=x.employee_name||'-';const department=document.createElement('span');department.className='picker-department';department.textContent=x.department_name||'-';department.title=x.department_name||'-';row.append(check,name,department);fragment.appendChild(row)});
    list.appendChild(fragment);if(!rows.length){const empty=document.createElement('div');empty.className='picker-empty';empty.textContent='추가할 수 있는 직원이 없습니다.';list.appendChild(empty)}renderPager('employeePickerPagination',rows.length,'employeePicker',renderEmployeePicker);updateEmployeePickerSelectionUI();
  };

  window.attendanceRenderPagination=function(totalRows){
    const box=$('attendancePagination'),pages=Math.max(1,Math.ceil(totalRows/PAGE_SIZE));state.attendancePage=Math.min(Math.max(1,state.attendancePage||1),pages);box.replaceChildren();if(totalRows<=PAGE_SIZE){box.hidden=true;return}box.hidden=false;
    const summary=document.createElement('span');summary.className='platform-page-summary';summary.textContent=`총 ${totalRows}명 · ${state.attendancePage}/${pages}페이지`;box.appendChild(summary);
    const add=(label,page,{active=false,disabled=false}={})=>{const button=document.createElement('button');button.type='button';button.className='attendance-page-button'+(active?' active':'');button.textContent=label;button.disabled=disabled;if(!disabled&&!active)button.onclick=()=>{state.attendancePage=page;attendanceRenderBoard()};box.appendChild(button)};
    add('이전',state.attendancePage-1,{disabled:state.attendancePage===1});for(let page=1;page<=pages;page++)add(String(page),page,{active:page===state.attendancePage});add('다음',state.attendancePage+1,{disabled:state.attendancePage===pages});
  };

})();


(function employeeDeleteAndAttendanceResetModule(){
  "use strict";
  const $id=id=>document.getElementById(id);

  function currentFilteredActiveEmployees(){
    const q=($id('activeEmployeeSearch')?.value||'').trim().toLowerCase();
    const filter=$id('activeStatusFilter')?.value||'';
    return (state.activeEmployees||[]).filter(employee=>(!filter||employee.employment_status===filter)&&(!q||`${employee.employee_name||''} ${employee.department_name||''} ${employee.job_title||''}`.toLowerCase().includes(q)));
  }

  function purgeEmployeesFromClientState(employeeIds){
    const ids=new Set((employeeIds||[]).map(id=>String(Number(id))));
    const keep=row=>!ids.has(String(Number(row?.employee_id??row?.id)));
    ['activeEmployees','retiredEmployees','currentEmployees','participants','attendanceBoard','monthlyHistoryRows'].forEach(key=>{
      if(Array.isArray(state[key]))state[key]=state[key].filter(keep);
    });
    if(state.attendancePair){
      ['round1','round2','rows'].forEach(key=>{if(Array.isArray(state.attendancePair[key]))state.attendancePair[key]=state.attendancePair[key].filter(keep)});
    }
    ids.forEach(id=>{
      state.activeEmployeeSelected?.delete?.(id);
      state.attendanceSelected?.delete?.(id);
      state.employeePickerSelected?.delete?.(id);
    });
    state.monthlyHistoryLoaded=false;
    state.monthlyHistoryRows=[];
    state.monthlyHistoryMonths=[];
    state.employeeRostersLoaded=false;
    state.selfHistoryRows=[];
    const resultBox=$id('selfHistoryResult');if(resultBox)resultBox.hidden=true;
  }

  async function refreshAllEmployeeLists(employeeIds){
    purgeEmployeesFromClientState(employeeIds);
    const jobs=[];
    if(typeof loadAllEmployeeRosters==='function')jobs.push(loadAllEmployeeRosters());
    if(typeof loadPublicData==='function')jobs.push(loadPublicData());
    if(typeof attendanceLoadBoard==='function'&&state.attendanceSessionId)jobs.push(attendanceLoadBoard({silent:true}));
    const participantModal=$id('participantModal');
    if(typeof reloadParticipants==='function'&&state.currentEducation?.id&&participantModal&&!participantModal.hidden)jobs.push(reloadParticipants({silent:true}));
    await Promise.allSettled(jobs);
    if(state.educationPanel==='monthly'&&typeof loadMonthlyHistory==='function'){
      try{await loadMonthlyHistory({force:true})}catch(error){console.warn('[삭제 후 월별 교육 조회 갱신]',error)}
    }
    if(typeof renderActiveEmployees==='function')renderActiveEmployees();
    if(typeof renderRetiredEmployees==='function')renderRetiredEmployees();
  }

  async function callFullDelete(employeeIds,label){
    const ids=[...new Set((employeeIds||[]).map(Number).filter(Number.isFinite))];
    if(!ids.length)return {deleted:[],failed:[]};
    let batch=await db.rpc('hard_delete_employees',{p_employee_ids:ids,p_force:true});
    if(!batch.error){
      const data=batch.data||{};
      const failedIds=new Set((data.errors||[]).map(item=>Number(item.employee_id||item.id)).filter(Number.isFinite));
      const blockedCount=Number(data.blocked_count||0);
      if(blockedCount&&!failedIds.size){
        console.warn(`[${label}] 일괄 삭제 응답에 실패 ID가 없어 개별 재시도합니다.`,data);
      }else{
        return {deleted:ids.filter(id=>!failedIds.has(id)),failed:[...failedIds]};
      }
    }else{
      console.warn(`[${label}] 일괄 삭제 RPC 실패, 개별 완전 삭제로 재시도`,batch.error);
    }
    const deleted=[],failed=[];
    for(const employeeId of ids){
      const result=await db.rpc('hard_delete_employee',{p_employee_id:employeeId,p_force:true});
      if(result.error){console.error(`[${label}] 사원 ${employeeId} 삭제 실패`,result.error);failed.push(employeeId)}else deleted.push(employeeId);
    }
    return {deleted,failed};
  }

  async function deleteEmployeeIds(employeeIds,label){
    const ids=[...new Set((employeeIds||[]).map(Number).filter(Number.isFinite))];
    if(!ids.length){showToast('삭제할 사원이 없습니다.');return false}
    const result=await callFullDelete(ids,label);
    if(result.deleted.length)await refreshAllEmployeeLists(result.deleted);
    if(result.failed.length){
      showToast(`삭제 ${result.deleted.length}명 · 실패 ${result.failed.length}명`);
      return false;
    }
    showToast(`${result.deleted.length}명의 사원과 연결된 모든 자료를 삭제했습니다.`);
    return true;
  }

  window.hardDeleteEmployee=async function(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const form=$id('hardDeleteForm');
    const submit=form?.querySelector('button[type="submit"]');
    const employeeId=Number($id('hardDeleteEmployeeId').value);
    const employeeName=$id('hardDeleteEmployeeNameValue').value;
    const confirmName=$id('hardDeleteConfirmName').value.trim();
    $id('hardDeleteError').textContent='';
    if(confirmName!==employeeName){$id('hardDeleteError').textContent='사원명이 일치하지 않습니다.';return false}
    if(!confirm(`${employeeName} 사원과 연결된 교육·출결·근무·부서 이력을 모든 명단에서 영구 삭제합니다. 계속하시겠습니까?`))return false;
    const original=submit?.textContent||'완전 삭제';
    if(submit){submit.disabled=true;submit.textContent='삭제 중'}
    try{
      const result=await callFullDelete([employeeId],'사원 개별 삭제');
      if(result.failed.length||!result.deleted.length){
        $id('hardDeleteError').textContent='연결 자료 삭제가 완료되지 않았습니다. 관리자 RPC 권한과 외래키 설정을 확인하세요.';
        return false;
      }
      closeModal('hardDeleteModal');
      await refreshAllEmployeeLists([employeeId]);
      showToast(`${employeeName} 사원과 연결된 모든 자료를 삭제했습니다.`);
      return false;
    }catch(error){
      console.error('[사원 개별 완전 삭제]',error);
      $id('hardDeleteError').textContent=friendlyErrorMessage(error,'사원 완전 삭제');
      return false;
    }finally{
      if(submit){submit.disabled=false;submit.textContent=original}
    }
  };

  window.hardDeleteSelectedEmployees=async function(){
    const ids=[...(state.activeEmployeeSelected||new Set())].map(Number);
    if(!ids.length){showToast('삭제할 사원을 선택하세요.');return}
    if(!confirm(`선택한 ${ids.length}명의 사원과 연결된 교육·출결·근무·부서 이력을 모든 명단에서 영구 삭제하시겠습니까?`))return;
    await deleteEmployeeIds(ids,'선택 사원 삭제');
  };

  window.attendanceResetSelectedLogs=async function(){
    const session=attendanceCurrentSession();
    const selectedRows=attendanceBulkRows();
    if(!session){showToast('교육 회차를 선택하세요.');return}
    if(!selectedRows.length){showToast('초기화할 사원을 선택하세요.');return}
    const names=selectedRows.slice(0,8).map(row=>row.employee_name).join(', ')+(selectedRows.length>8?` 외 ${selectedRows.length-8}명`:'');
    if(!confirm(`${session.session_name||'교육'} ${session.round_no||1}차에서 선택한 ${selectedRows.length}명의 입·퇴실 로그와 미수강 서명을 초기화하시겠습니까?\n${names}\n비고는 유지됩니다.`))return;
    const button=$id('attendanceClearSelectionButton'),original=button.textContent;
    button.disabled=true;button.textContent='초기화 중';
    try{
      const employeeIds=selectedRows.map(row=>Number(row.employee_id));
      const result=await db.rpc('reset_selected_attendance_logs',{p_session_id:state.attendanceSessionId,p_employee_ids:employeeIds});
      if(result.error)throw result.error;
      state.attendanceSelected.clear();
      await attendanceLoadBoard({silent:true});
      showToast(`선택한 ${Number(result.data?.selected_employee_count||employeeIds.length)}명의 출결 로그와 미수강 서명을 초기화했습니다.`);
    }catch(error){
      console.error('[선택 출결 로그·미수강 서명 초기화]',error);
      showToast('요청을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.');
    }finally{
      button.textContent=original;
      attendanceUpdateSelection();
    }
  };

})();

(function roleAndAttendanceSessionModule(){
  "use strict";
  state.isAuthenticated=Boolean(state.isAuthenticated);
  state.userRole="worker";
  state.attendanceTargetPreviewDate="";
  state.attendanceTargetPreviewCount=null;
  window.checkAdmin=async function(session){
    state.isAuthenticated=Boolean(session?.user);
    state.isAdmin=false;
    if(state.isAuthenticated){
      const result=await db.rpc("is_admin");
      if(result.error)console.error("[관리자 권한 확인]",result.error);
      state.isAdmin=!result.error&&result.data===true;
    }
    state.userRole=state.isAdmin?"education_manager":"worker";
    document.body.dataset.userRole=state.userRole;
    document.body.classList.toggle("admin-mode",state.isAdmin);
    syncAdminUI();
  };

  window.syncAdminUI=function(){
    $("adminMenu").hidden=!state.isAdmin;
    const myHistoryButton=$("myHistoryButton");if(myHistoryButton)myHistoryButton.hidden=true;
    $("loginButton").hidden=state.isAdmin;
    $("personalHistoryButton").hidden=!state.isAdmin;
    $("adminTopActions").hidden=!state.isAdmin;
    $("logoutButton").hidden=!state.isAdmin;
    $("addEducationButton").hidden=!(state.isAdmin&&state.currentView==="education");
    const halfYearButton=$("regularHalfYearImportButton");if(halfYearButton)halfYearButton.hidden=!(state.isAdmin&&state.currentView==="education"&&categoryMeta(state.selectedCategoryId).type==="regular");
    if(!state.isAdmin&&state.currentView!=="education")showView("education");
    if(state.isAdmin&&state.currentView==="employees")loadEmployeeTab(state.employeeTab);
    if(state.categories.length){
      renderCategoryMenu();
      renderEducationTable();
    }
  };
  window.attendanceDeleteSelected=async function(){
    const rows=attendanceBulkRows();
    if(!state.attendanceSessionId){showToast("교육 회차를 선택하세요.");return}
    if(!rows.length){showToast("삭제할 사원을 선택하세요.");return}
    if(!confirm(`선택한 ${rows.length}명의 현재 회차 출결 기록·비고·미수강 서명을 삭제하시겠습니까?\n대상인원 명단에서는 삭제되지 않습니다.`))return;
    const button=$("attendanceDeleteSelectedButton"),original=button.textContent;
    button.disabled=true;button.textContent="삭제 중";
    try{
      const result=await db.rpc("delete_attendance_employee_rows",{p_session_id:state.attendanceSessionId,p_employee_ids:rows.map(row=>Number(row.employee_id))});
      if(result.error)throw result.error;
      state.attendanceSelected.clear();
      await attendanceLoadBoard({silent:true});
      showToast(`${Number(result.data?.selected_employee_count||rows.length)}명의 출결 기록을 삭제했습니다.`);
    }catch(error){console.error("[선택 출결 삭제]",error);showToast("출결 기록 삭제 중 오류가 발생했습니다.")}
    finally{button.textContent=original;attendanceUpdateSelection()}
  };

  async function attendancePreviewTargets(){
    const date=$("attendanceSessionDate").value;
    const sessionId=$("attendanceSessionId").value;
    if(sessionId){
      const result=await db.rpc("attendance_session_target_count",{p_session_id:sessionId});
      if(result.error){console.error("[회차 대상인원 확인]",result.error);showToast("대상인원을 확인하지 못했습니다.");return}
      const count=Number(result.data?.target_count||0);
      $("attendanceTargetLoadInfo").textContent=`이 회차의 고정 대상인원은 ${count}명입니다. 생성 후에는 변경되지 않습니다.`;
      return;
    }
    if(!date){showToast("교육일자를 먼저 선택하세요.");return}
    const result=await db.rpc("attendance_preview_month_targets",{p_session_date:date});
    if(result.error){console.error("[월별 대상인원 미리보기]",result.error);showToast("대상인원을 불러오지 못했습니다.");return}
    const count=Number(result.data?.target_count||0);
    state.attendanceTargetPreviewDate=date;
    state.attendanceTargetPreviewCount=count;
    $("attendanceTargetLoadInfo").textContent=`${date.slice(0,7)} 대상인원 ${count}명을 확인했습니다. 저장하면 이 명단으로 고정됩니다.`;
  }

  window.attendanceOpenSessionForm=function(session=null){
    const date=session?.session_date||new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    $("attendanceSessionModalTitle").textContent=session?"교육 회차 수정":"교육 회차 생성";
    $("attendanceSessionId").value=session?.id||"";
    $("attendanceSessionDate").value=date;
    $("attendanceSessionName").value=attendanceAutoSessionName(date);
    $("attendanceRoundNo").value=String(session?.round_no||1);
    $("attendanceSessionStart").value="09:30";
    $("attendanceSessionEnd").value="11:30";
    $("attendanceSessionError").textContent="";
    $("attendanceSessionSubmit").disabled=false;
    $("attendanceSessionSubmit").textContent="저장";
    state.attendanceTargetPreviewDate="";
    state.attendanceTargetPreviewCount=null;
    $("attendanceLoadTargetsButton").textContent=session?"대상인원 확인":"대상인원 불러오기";
    $("attendanceTargetLoadInfo").textContent=session?"저장된 고정 대상인원을 확인할 수 있습니다.":"교육일자를 선택한 뒤 대상인원을 불러오세요.";
    openModal("attendanceSessionModal");
    if(session)attendancePreviewTargets();
  };

  window.attendanceSaveSession=async function(event){
    event.preventDefault();
    const id=$("attendanceSessionId").value||null,date=$("attendanceSessionDate").value,roundNo=Number($("attendanceRoundNo").value);
    const startTime=$("attendanceSessionStart").value,endTime=$("attendanceSessionEnd").value,errorBox=$("attendanceSessionError"),submit=$("attendanceSessionSubmit");
    errorBox.textContent="";
    if(!date){errorBox.textContent="교육일자를 입력하세요.";return}
    if(!startTime||!endTime){errorBox.textContent="시작시각과 종료시각을 입력하세요.";return}
    if(attendanceTimeToMinutes(endTime)<=attendanceTimeToMinutes(startTime)){errorBox.textContent="종료시각은 시작시각보다 늦어야 합니다.";return}
    if(!id&&(state.attendanceTargetPreviewDate!==date||state.attendanceTargetPreviewCount===null)){errorBox.textContent="대상인원 불러오기를 먼저 실행하세요.";return}
    submit.disabled=true;submit.textContent="저장 중";
    try{
      const savedResult=await db.rpc("save_attendance_session",{p_session_id:id,p_session_date:date,p_round_no:roundNo,p_start_time:startTime,p_end_time:endTime});
      if(savedResult.error)throw savedResult.error;
      const saved=Array.isArray(savedResult.data)?savedResult.data[0]:savedResult.data;
      if(!saved?.id)throw new Error("저장된 회차 ID가 없습니다.");
      const savedId=String(saved.id);
      if(!id){
        const targetResult=await db.rpc("attendance_load_session_targets",{p_session_id:savedId});
        if(targetResult.error)throw targetResult.error;
      }
      state.attendanceSessionId=savedId;
      localStorage.setItem(ATTENDANCE_CONFIG.lastSessionKey,savedId);
      attendanceUpsertSessionLocal(saved);
      await attendanceLoadSessions({preferredId:savedId,autoSelect:true});
      await attendanceLoadBoard();
      attendanceSubscribeRealtime();
      closeModal("attendanceSessionModal");
      showToast(id?"교육 회차를 수정했습니다.":`교육 회차와 대상인원 ${state.attendanceTargetPreviewCount||0}명을 생성했습니다.`);
    }catch(error){console.error("[교육 회차 저장]",error);errorBox.textContent="교육 회차 또는 대상인원 저장 중 오류가 발생했습니다."}
    finally{submit.disabled=false;submit.textContent="저장"}
  };

  $("attendanceLoadTargetsButton").onclick=attendancePreviewTargets;
  $("attendanceSessionDate").onchange=event=>{
    $("attendanceSessionName").value=attendanceAutoSessionName(event.target.value);
    if(!$("attendanceSessionId").value){state.attendanceTargetPreviewDate="";state.attendanceTargetPreviewCount=null;$("attendanceTargetLoadInfo").textContent="교육일자가 변경되었습니다. 대상인원을 다시 불러오세요."}
  };
})();


(function environmentSafetyFinalRequirementsPatch(){
  "use strict";
  const byId=id=>document.getElementById(id);
  const PAGE_SIZE=100;
  const clone=value=>typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value));
  const safeText=value=>String(value??"");

  // ------------------------------------------------------------------
  // Common search reset: menu entry, tab entry and modal opening.
  // ------------------------------------------------------------------
  const searchIdsByView={
    education:[],
    employees:["activeEmployeeSearch","retiredEmployeeSearch"],
    departments:["departmentSearch"],
    attendance:["attendanceSearch"]
  };
  document.querySelectorAll('input[type="search"]').forEach(input=>{
    input.setAttribute("autocomplete","off");
    input.setAttribute("autocorrect","off");
    input.setAttribute("autocapitalize","off");
    input.setAttribute("spellcheck","false");
  });
  function clearSearchInputs(ids){
    ids.forEach(id=>{const input=byId(id);if(input)input.value=""});
  }
  function resetPagingForView(view){
    if(window.platformPaging){
      if(view==="employees"){platformPaging.active=1;platformPaging.retired=1}
      if(view==="departments")platformPaging.department=1;
      if(view==="education")platformPaging.education=1;
    }
    if(window.paging){
      if(view==="employees"){paging.active=1;paging.retired=1}
      if(view==="departments")paging.department=1;
      if(view==="education")paging.education=1;
    }
    if(view==="attendance")state.attendancePage=1;
  }
  function renderResetView(view){
    if(view==="employees")state.employeeTab==="retired"?renderRetiredEmployees():renderActiveEmployees();
    else if(view==="departments")renderDepartments();
    else if(view==="attendance")attendanceRenderBoard();
    else if(view==="education")renderEducationTable();
  }
  const previousShowView=window.showView;
  window.showView=function(name){
    clearSearchInputs(searchIdsByView[name]||[]);
    resetPagingForView(name);
    if(name==="attendance"&&typeof ATTENDANCE_CONFIG!=="undefined"&&ATTENDANCE_CONFIG.searchKey)localStorage.removeItem(ATTENDANCE_CONFIG.searchKey);
    const result=previousShowView(name);
    if(name!=="attendance")queueMicrotask(()=>renderResetView(name));
    return result;
  };
  const previousOpenModal=window.openModal;
  window.openModal=function(id){
    const modal=byId(id);
    if(modal)clearSearchInputs([...modal.querySelectorAll('input[type="search"]')].map(input=>input.id).filter(Boolean));
    if(id==="participantModal"){
      if(window.platformPaging){platformPaging.employeePicker=1;platformPaging.participant=1}
    }
    return previousOpenModal(id);
  };
  const previousLoadEmployeeTab=window.loadEmployeeTab;
  if(typeof previousLoadEmployeeTab==="function")window.loadEmployeeTab=function(tab){
    clearSearchInputs(tab==="retired"?["retiredEmployeeSearch"]:["activeEmployeeSearch"]);
    resetPagingForView("employees");
    return previousLoadEmployeeTab(tab);
  };
  // Attendance paired round board and partial row updates.
  // ------------------------------------------------------------------
  state.attendancePair={round1Session:null,round2Session:null,round1:[],round2:[],rows:[],chart:null};
  function attendanceAnchorSession(){return state.attendanceSessions.find(session=>String(session.id)===String(state.attendanceSessionId))||null}
  function attendancePairSessions(){
    const anchor=attendanceAnchorSession();if(!anchor)return {round1:null,round2:null};const month=String(anchor.session_date||"").slice(0,7),name=String(anchor.session_name||"");
    const same=state.attendanceSessions.filter(session=>String(session.session_date||"").slice(0,7)===month&&String(session.session_name||"")===name);
    return {round1:same.find(session=>Number(session.round_no)===1)||null,round2:same.find(session=>Number(session.round_no)===2)||null};
  }
  async function attendanceFetchSnapshot(session){
    if(!session)return [];
    const result=await db.rpc("attendance_get_snapshot_board",{p_session_id:session.id});
    if(result.error){console.error(`[교육 출결관리] ${session.round_no}차 명단 조회 실패`,result.error);throw result.error}
    return (Array.isArray(result.data)?result.data:[]).map(row=>({...row,intervals:Array.isArray(row.intervals)?row.intervals:[]}));
  }
  function attendancePairMerge(){
    const map=new Map(),add=(rows,round)=>rows.forEach(row=>{const key=String(row.employee_id),item=map.get(key)||{employee_id:row.employee_id,employee_name:row.employee_name,department_name:row.department_name,job_title:row.job_title,round1:null,round2:null};item[`round${round}`]=row;if(!item.employee_name)item.employee_name=row.employee_name;if(!item.department_name)item.department_name=row.department_name;if(!item.job_title)item.job_title=row.job_title;map.set(key,item)});add(state.attendancePair.round1,1);add(state.attendancePair.round2,2);
    state.attendancePair.rows=[...map.values()].sort((a,b)=>String(a.department_name||"").localeCompare(String(b.department_name||""),"ko")||String(a.employee_name||"").localeCompare(String(b.employee_name||""),"ko"));
  }
  function attendanceSelectedRound(){return Number(attendanceAnchorSession()?.round_no||1)}
  function attendanceRoundCompleted(row){return Boolean(row&&Number(row.visit_count||0)>0&&Number(row.closed_visit_count||0)>0&&!row.open_visit_id)}
  function attendanceSelectedData(item){const round=attendanceSelectedRound();if(round===2&&attendanceRoundCompleted(item?.round1))return null;return item?.[`round${round}`]||null}
  function attendanceDisplayData(item){const selectedRound=attendanceSelectedRound();if(selectedRound===2&&attendanceRoundCompleted(item?.round1))return {row:item.round1,round:1,excluded:true};return {row:item?.[`round${selectedRound}`]||null,round:selectedRound,excluded:false}}
  function attendanceEligibleRows(){return state.attendancePair.rows.map(item=>attendanceSelectedData(item)).filter(Boolean)}
  function attendancePairFilteredRows(){
    const q=byId("attendanceSearch").value.trim().toLowerCase(),department=byId("attendanceDepartmentFilter").value,status=byId("attendanceStatusFilter").value;
    return state.attendancePair.rows.filter(item=>{if(q&&!`${item.employee_name||""} ${item.department_name||""} ${item.job_title||""}`.toLowerCase().includes(q))return false;if(department&&item.department_name!==department)return false;const display=attendanceDisplayData(item),row=display.row;if(!row)return status?false:true;const hasIn=Number(row.visit_count||0)>0,hasOut=Number(row.closed_visit_count||0)>0;if(status==="not_started"&&(hasIn||display.excluded))return false;if(status==="entered"&&(!hasIn||display.excluded))return false;if(status==="completed"&&(!display.excluded&&(!hasOut||row.open_visit_id)))return false;if(status==="missed"&&(!attendanceSelectedData(item)?.missed_signature))return false;return true});
  }
  function attendancePopulatePairDepartments(){
    const select=byId("attendanceDepartmentFilter"),current=select.value,depts=[...new Set(state.attendancePair.rows.map(row=>row.department_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko"));select.replaceChildren(new Option("전체 부서",""));depts.forEach(dept=>select.appendChild(new Option(dept,dept)));select.value=depts.includes(current)?current:"";
  }
  function attendanceSeoulDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
  function attendanceSeoulMinutes(){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date()).split(":").map(Number);return parts[0]*60+parts[1]}
  function attendanceLiveActionAllowed(session){return Boolean(session&&String(session.session_date||"").slice(0,10)===attendanceSeoulDate()&&attendanceSeoulMinutes()>=570&&attendanceSeoulMinutes()<=690)}
  function attendanceNormalizeEntryTime(value){const digits=String(value||"").replace(/\D/g,"").slice(0,4);if(digits.length!==4)return null;const h=Number(digits.slice(0,2)),m=Number(digits.slice(2));if(h>23||m>59)return null;const normalized=`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`,minutes=h*60+m;return minutes>=570&&minutes<=690?normalized:null}
  function attendanceSessionTimestamp(session,time){const date=String(session?.session_date||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;return new Date(`${date}T${time}:00+09:00`).toISOString()}
  function attendanceSortedIntervals(row){return attendanceIntervals(row).slice().sort((a,b)=>new Date(a.check_in_at||0)-new Date(b.check_in_at||0))}
  function attendanceBoundaryTime(row,kind){const intervals=attendanceSortedIntervals(row);if(!intervals.length)return "";const value=kind==="in"?intervals.find(item=>item.check_in_at)?.check_in_at:[...intervals].reverse().find(item=>item.check_out_at)?.check_out_at;const formatted=attendanceFormatTime(value);return formatted==="-"?"":formatted}
  function attendanceMoveDirectInput(input,delta){const selector=`.attendance-direct-time[data-kind="${input.dataset.kind}"][data-round="${input.dataset.round}"]`;const inputs=[...byId("attendanceTableBody").querySelectorAll(selector)].filter(item=>!item.disabled),current=inputs.find(item=>item.dataset.id===input.dataset.id)||input,index=inputs.indexOf(current),next=inputs[index+delta];if(next)requestAnimationFrame(()=>{next.focus();next.select()})}
  async function attendanceSaveDirectTime(input,item,kind){
    if(input.dataset.saving==="1")return false;const normalized=attendanceNormalizeEntryTime(input.value);if(!normalized){input.value=input.dataset.saved||"";showToast("09:30~11:30 사이의 시간을 HHMM 형식으로 입력하세요.");return false}
    if(normalized===input.dataset.saved)return true;const round=Number(input.dataset.round),session=state.attendancePair[`round${round}Session`],row=item?.[`round${round}`];if(!session||!row)return false;
    const iso=attendanceSessionTimestamp(session,normalized);if(!iso){showToast("교육일자를 확인하세요.");return false}const intervals=attendanceSortedIntervals(row);input.dataset.saving="1";input.disabled=true;input.closest(".attendance-direct-cell")?.classList.add("is-saving");
    try{
      if(kind==="in"){
        const target=intervals.find(interval=>interval.check_in_at);if(target?.id){if(target.check_out_at&&new Date(iso)>new Date(target.check_out_at))throw new Error("입실시간은 퇴실시간보다 늦을 수 없습니다.");const result=await db.rpc("attendance_update_interval",{p_interval_id:target.id,p_check_in_at:iso,p_check_out_at:target.check_out_at||null});if(result.error)throw result.error}
        else{const result=await db.rpc("bulk_start_attendance",{p_session_id:session.id,p_employee_ids:[Number(item.employee_id)],p_recorded_at:iso});if(result.error)throw result.error;await attendanceSyncEducationDates(session,[Number(item.employee_id)],String(session.session_date||"").slice(0,10))}
      }else{
        const target=[...intervals].reverse().find(interval=>!interval.check_out_at)||[...intervals].reverse().find(interval=>interval.check_in_at);if(!target)throw new Error("입실시간을 먼저 입력하세요.");if(new Date(iso)<new Date(target.check_in_at))throw new Error("퇴실시간은 입실시간보다 빠를 수 없습니다.");
        if(target.check_out_at&&target.id){const result=await db.rpc("attendance_update_interval",{p_interval_id:target.id,p_check_in_at:target.check_in_at,p_check_out_at:iso});if(result.error)throw result.error}
        else{const result=await db.rpc("bulk_end_attendance",{p_session_id:session.id,p_employee_ids:[Number(item.employee_id)],p_recorded_at:iso});if(result.error)throw result.error}
      }
      if(kind==="in")await attendanceSyncEducationDates(session,[Number(item.employee_id)],String(session.session_date||"").slice(0,10));
      const refreshed=await attendanceFetchSnapshot(session);state.attendancePair[`round${round}`]=refreshed;attendancePairMerge();attendanceRenderBoard();attendanceLoadDepartmentRatesFinal();showToast(`${kind==="in"?"입실":"퇴실"}시간을 저장했습니다.`);return true
    }catch(error){console.error("[출결 시간 직접입력]",error);input.value=input.dataset.saved||"";showToast(error?.message||"출결시간을 저장하지 못했습니다.");return false}
    finally{input.dataset.saving="0";input.disabled=false;input.closest(".attendance-direct-cell")?.classList.remove("is-saving")}
  }
  function attendanceDirectCell(item,kind){
    const display=attendanceDisplayData(item),row=display.row,round=display.round,session=state.attendancePair[`round${round}Session`];if(!session||!row)return `<div class="attendance-round-static not-target"><span>--:--</span><span>${session?"비대상":"회차 없음"}</span></div>`;if(display.excluded){const time=attendanceBoundaryTime(row,kind)||"--:--";return `<div class="attendance-round-static first-complete"><span>${escapeHtml(time)}</span><span>${kind==="in"?"1차완료":"2차제외"}</span></div>`}
    const value=attendanceBoundaryTime(row,kind),liveAllowed=attendanceLiveActionAllowed(session),hasOpen=Boolean(row.open_visit_id),hasAny=attendanceIntervals(row).length>0,buttonEnabled=liveAllowed&&(kind==="in"?!hasAny:hasOpen),buttonTitle=!liveAllowed?"교육 당일 09:30~11:30에만 사용할 수 있습니다.":kind==="in"&&hasAny?"이미 입실 기록이 있습니다.":kind==="out"&&!hasOpen?"진행 중인 입실 기록이 없습니다.":"현재 시각 기록";
    return `<div class="attendance-direct-cell"><input class="attendance-direct-time" data-id="${item.employee_id}" data-kind="${kind}" data-round="${round}" data-saved="${escapeHtml(value)}" inputmode="numeric" maxlength="5" placeholder="${kind==="in"?"09:30":"11:30"}" value="${escapeHtml(value)}" aria-label="${escapeHtml(item.employee_name||"대상자")} ${kind==="in"?"입실":"퇴실"} 시간"><button class="attendance-live-action ${kind==="out"?"checkout":""}" data-id="${item.employee_id}" data-round="${round}" data-action="${kind==="in"?"check_in":"check_out"}" type="button" ${buttonEnabled?"":"disabled"} title="${escapeHtml(buttonTitle)}">지금</button></div>`
  }
  function attendanceUnifiedCell(item,kind){return attendanceDirectCell(item,kind)}
  function attendancePairRowElement(item,index){
    const tr=document.createElement("tr"),id=String(item.employee_id),selected=attendanceSelectedData(item),display=attendanceDisplayData(item),selectable=Boolean(selected),totalMinutes=Number(item.round1?.education_minutes||0)+Number(item.round2?.education_minutes||0);tr.dataset.employeeId=id;
    const missedLabel=display.excluded?"제외":selected?.missed_signature?"미수강":"정상";
    tr.innerHTML=`<td class="center"><input class="attendance-row-check" type="checkbox" value="${id}" ${state.attendanceSelected.has(id)?"checked":""} ${selectable?"":"disabled"}></td><td class="center">${index}</td><td class="ellipsis" title="${escapeHtml(item.department_name||"-")}">${escapeHtml(item.department_name||"-")}</td><td class="center">${escapeHtml(item.job_title||"-")}</td><td class="center"><button class="attendance-person-button attendance-open-log" data-id="${id}" type="button">${escapeHtml(item.employee_name||"-")}</button></td><td class="attendance-unified-cell">${attendanceUnifiedCell(item,"in")}</td><td class="attendance-unified-cell">${attendanceUnifiedCell(item,"out")}</td><td><div class="attendance-duration-total">${totalMinutes}분</div></td><td class="center"><button class="attendance-missed-toggle ${selected?.missed_signature?"active":""}" data-id="${id}" type="button" ${selectable?"":"disabled"}>${missedLabel}</button></td><td><input class="attendance-memo-input" data-employee-id="${id}" value="${escapeHtml(selected?.memo||"")}" aria-label="비고 입력" title="클릭하여 비고 입력" ${selectable?"":"disabled"}></td>`;
    bindAttendancePairRow(tr);return tr;
  }
  function bindAttendancePairRow(tr){
    tr.querySelector(".attendance-row-check")?.addEventListener("change",event=>{event.target.checked?state.attendanceSelected.add(event.target.value):state.attendanceSelected.delete(event.target.value);attendanceUpdateSelection()});
    tr.querySelectorAll(".attendance-live-action").forEach(button=>button.onclick=event=>attendanceRunRoundAction(event,button.dataset.action,button));
    tr.querySelectorAll(".attendance-direct-time").forEach(input=>{
      input.addEventListener("input",()=>{const digits=input.value.replace(/\D/g,"").slice(0,4);input.value=digits.length>2?`${digits.slice(0,2)}:${digits.slice(2)}`:digits});
      input.addEventListener("focus",()=>input.select());
      input.addEventListener("keydown",async event=>{if(event.key==="Enter"){event.preventDefault();const item=state.attendancePair.rows.find(row=>String(row.employee_id)===String(input.dataset.id));const saved=await attendanceSaveDirectTime(input,item,input.dataset.kind);if(saved)attendanceMoveDirectInput(input,event.shiftKey?-1:1)}else if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();const item=state.attendancePair.rows.find(row=>String(row.employee_id)===String(input.dataset.id));const saved=await attendanceSaveDirectTime(input,item,input.dataset.kind);if(saved)attendanceMoveDirectInput(input,event.key==="ArrowDown"?1:-1)}});
      input.addEventListener("blur",()=>{const item=state.attendancePair.rows.find(row=>String(row.employee_id)===String(input.dataset.id));attendanceSaveDirectTime(input,item,input.dataset.kind)});
    });
    tr.querySelector(".attendance-open-log")?.addEventListener("click",event=>{const item=state.attendancePair.rows.find(row=>String(row.employee_id)===String(event.currentTarget.dataset.id)),row=attendanceDisplayData(item).row||item?.round1||item?.round2;if(row)attendanceOpenLog(row)});
    tr.querySelector(".attendance-missed-toggle")?.addEventListener("click",event=>attendanceToggleMissed(event.currentTarget.dataset.id));
    const memo=tr.querySelector(".attendance-memo-input");if(memo){memo.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();memo.blur()}};memo.onblur=()=>attendanceSaveMemoInline(memo)}
  }
  function attendancePairPage(){const filtered=attendancePairFilteredRows(),pages=Math.max(1,Math.ceil(filtered.length/state.attendancePageSize));state.attendancePage=Math.min(Math.max(1,state.attendancePage),pages);const start=(state.attendancePage-1)*state.attendancePageSize;return {filtered,pages,start,items:filtered.slice(start,start+state.attendancePageSize)}}
  window.attendanceRenderBoard=function(){
    const page=attendancePairPage(),body=byId("attendanceTableBody");body.replaceChildren();const f=document.createDocumentFragment();page.items.forEach((item,index)=>f.appendChild(attendancePairRowElement(item,page.start+index+1)));body.appendChild(f);
    byId("attendanceResultCount").textContent=page.filtered.length?`${page.filtered.length}명 · ${state.attendancePage}/${page.pages}페이지`:"0명";attendanceRenderPagination(page.filtered.length);
    const selectedRows=attendanceEligibleRows();state.attendanceBoard=selectedRows;
    byId("attendanceActiveCount").textContent=selectedRows.length;byId("attendanceCheckInCount").textContent=selectedRows.filter(row=>Number(row.visit_count||0)>0).length;byId("attendanceCheckOutCount").textContent=selectedRows.filter(row=>Number(row.closed_visit_count||0)>0&&!row.open_visit_id).length;byId("attendanceSuspectedCount").textContent=selectedRows.filter(row=>Boolean(row.missed_signature)).length;document.querySelectorAll("#attendanceView .attendance-summary-filter").forEach(card=>{const active=card.dataset.attendanceStatus===byId("attendanceStatusFilter").value;card.classList.toggle("active",active);card.setAttribute("aria-pressed",String(active))});attendanceUpdateSelection();
  };
  window.attendanceRenderEmpty=function(){state.attendancePair={round1Session:null,round2Session:null,round1:[],round2:[],rows:[],chart:null};state.attendanceBoard=[];state.attendancePage=1;byId("attendanceTableBody").innerHTML='<tr><td colspan="10" class="attendance-empty-session">교육 회차를 선택하세요.</td></tr>';["attendanceActiveCount","attendanceCheckInCount","attendanceCheckOutCount","attendanceSuspectedCount"].forEach(id=>byId(id).textContent="0");byId("attendanceResultCount").textContent="0명";byId("attendancePagination").hidden=true;attendanceUpdateSelection();attendanceSetChartEmpty("교육 회차를 선택하세요.")};
  window.attendanceLoadBoard=async function({silent=false}={}){
    if(!state.attendanceSessionId){attendanceRenderEmpty();return}const sessions=attendancePairSessions();state.attendancePair.round1Session=sessions.round1;state.attendancePair.round2Session=sessions.round2;if(!silent)setStatus("attendanceStatus","1차·2차 고정 대상인원을 불러오는 중입니다.");
    try{const [round1,round2]=await Promise.all([attendanceFetchSnapshot(sessions.round1),attendanceFetchSnapshot(sessions.round2)]);state.attendancePair.round1=round1;state.attendancePair.round2=round2;attendancePairMerge();attendancePopulatePairDepartments();attendanceRenderBoard();setStatus("attendanceStatus",state.attendancePair.rows.length?"":"이 교육에 고정된 대상인원이 없습니다.",!state.attendancePair.rows.length);attendanceLoadDepartmentRatesFinal()}catch(error){console.error("[교육 출결관리] 1차·2차 명단 조회 실패",error);attendanceRenderEmpty();setStatus("attendanceStatus","교육 출석체크 명단을 불러오지 못했습니다.",true)}
  };
  function replacePairBoardRow(round,serverRow){
    const rows=state.attendancePair[`round${round}`],index=rows.findIndex(row=>String(row.employee_id)===String(serverRow.employee_id));if(index>=0)rows[index]=serverRow;else rows.push(serverRow);attendancePairMerge();state.attendanceBoard=attendanceEligibleRows();
  }
  function patchAttendancePairRow(employeeId){
    const page=attendancePairPage(),itemIndex=page.items.findIndex(item=>String(item.employee_id)===String(employeeId));if(itemIndex<0)return;const current=byId("attendanceTableBody").querySelector(`tr[data-employee-id="${CSS.escape(String(employeeId))}"]`),next=attendancePairRowElement(page.items[itemIndex],page.start+itemIndex+1);if(current)current.replaceWith(next);
    const selectedRows=attendanceEligibleRows();byId("attendanceActiveCount").textContent=selectedRows.length;byId("attendanceCheckInCount").textContent=selectedRows.filter(row=>Number(row.visit_count||0)>0).length;byId("attendanceCheckOutCount").textContent=selectedRows.filter(row=>Number(row.closed_visit_count||0)>0&&!row.open_visit_id).length;byId("attendanceSuspectedCount").textContent=selectedRows.filter(row=>Boolean(row.missed_signature)).length;
  }
  function optimisticRoundMutation(row,action){
    const now=new Date().toISOString(),intervals=attendanceIntervals(row).map(item=>({...item}));if(action==="check_in"){const temp=`temp-${Date.now()}`;intervals.push({id:temp,check_in_at:now,check_out_at:null,duration_minutes:null});row.open_visit_id=temp}else{const open=intervals.slice().reverse().find(item=>!item.check_out_at);if(open){open.check_out_at=now;open.duration_minutes=Math.max(0,Math.floor((new Date(now)-new Date(open.check_in_at))/60000))}row.open_visit_id=null}row.intervals=intervals;row.visit_count=intervals.length;row.closed_visit_count=intervals.filter(item=>item.check_out_at).length;row.education_minutes=intervals.reduce((sum,item)=>sum+(Number(item.duration_minutes)||0),0);
  }
  async function attendanceRunRoundAction(event,action,button){
    event.preventDefault();event.stopPropagation();const employeeId=String(button.dataset.id),round=Number(button.dataset.round),session=state.attendancePair[`round${round}Session`],item=state.attendancePair.rows.find(row=>String(row.employee_id)===employeeId),row=item?.[`round${round}`];if(!session||!row||button.classList.contains("is-loading"))return;if(!attendanceLiveActionAllowed(session)){showToast("단일 입·퇴실 버튼은 교육 당일 09:30~11:30에만 사용할 수 있습니다.");return}
    const backup=clone(row),tableScroll=button.closest(".table-wrap")?.scrollLeft||0;button.classList.add("is-loading");button.disabled=true;optimisticRoundMutation(row,action);patchAttendancePairRow(employeeId);
    try{const result=await db.rpc(action==="check_in"?"check_in_attendance_v2":"check_out_attendance_v2",{p_session_id:session.id,p_employee_id:Number(employeeId)});if(result.error)throw result.error;if(action==="check_in")await attendanceSyncEducationDates(session,[Number(employeeId)]);const refreshed=await attendanceFetchSnapshot(session),serverRow=refreshed.find(item=>String(item.employee_id)===employeeId);state.attendancePair[`round${round}`]=refreshed;if(serverRow)replacePairBoardRow(round,serverRow);patchAttendancePairRow(employeeId);attendanceLoadDepartmentRatesFinal();showToast(action==="check_in"?`${round}차 입실을 기록했습니다.`:`${round}차 퇴실을 기록했습니다.`)}catch(error){console.error(`[교육 출결관리] ${round}차 ${action==="check_in"?"입실":"퇴실"} 저장 실패`,error);Object.assign(row,backup);patchAttendancePairRow(employeeId);showToast(action==="check_in"?"입실 기록을 저장하지 못했습니다.":"퇴실 기록을 저장하지 못했습니다.")}finally{const wrap=byId("attendanceTableBody").closest(".table-wrap");if(wrap)wrap.scrollLeft=tableScroll}
  }
  window.attendanceUpdateSelection=function(){const count=state.attendanceSelected.size;byId("attendanceSelectedCount").textContent=`선택 ${count}명`;byId("attendanceClearSelectionButton").disabled=!state.attendanceSessionId||!count;byId("attendanceDeleteSelectedButton").disabled=!state.attendanceSessionId||!count;byId("attendanceStartPeopleButton").disabled=!count;byId("attendanceEndPeopleButton").disabled=!count;const visible=attendancePairPage().items.filter(item=>attendanceSelectedData(item));byId("attendanceSelectAll").checked=visible.length>0&&visible.every(item=>state.attendanceSelected.has(String(item.employee_id)));byId("attendanceSelectAll").indeterminate=visible.some(item=>state.attendanceSelected.has(String(item.employee_id)))&&!byId("attendanceSelectAll").checked};
  byId("attendanceSelectAll").onchange=event=>{attendancePairPage().items.forEach(item=>{if(!attendanceSelectedData(item))return;event.target.checked?state.attendanceSelected.add(String(item.employee_id)):state.attendanceSelected.delete(String(item.employee_id))});attendanceRenderBoard()};
  byId("attendanceSearch").oninput=debounce(()=>{state.attendancePage=1;attendanceRenderBoard()},160);byId("attendanceDepartmentFilter").onchange=()=>{state.attendancePage=1;attendanceRenderBoard()};byId("attendanceStatusFilter").onchange=()=>{state.attendancePage=1;attendanceRenderBoard()};
  document.querySelectorAll("#attendanceView .attendance-summary-filter").forEach(card=>card.onclick=()=>{byId("attendanceStatusFilter").value=card.dataset.attendanceStatus||"";state.attendancePage=1;attendanceRenderBoard()});

  // ------------------------------------------------------------------
  // Bottom responsive canvas chart with collapse and PNG export.
  // ------------------------------------------------------------------
  const chartCollapse=byId("attendanceChartCollapse"),chartToggle=byId("attendanceChartToggle"),chartDownload=byId("attendanceChartDownload"),chartCanvas=byId("attendanceChartCanvas"),chartEmpty=byId("attendanceChartEmpty"),chartScroll=byId("attendanceDepartmentChart");
  let chartResizeTimer=null,chartRequestToken=0;
  function chartIsOpen(){return chartCollapse.classList.contains("open")}
  function setChartOpen(open){chartCollapse.classList.toggle("open",open);chartCollapse.setAttribute("aria-hidden",String(!open));chartToggle.setAttribute("aria-expanded",String(open));chartToggle.textContent=open?"그래프 닫기":"그래프 열기";localStorage.setItem("attendance_chart_open",open?"1":"0");if(open&&state.attendancePair.chart)requestAnimationFrame(()=>drawAttendanceChart(false))}
  function attendanceSetChartEmpty(message){state.attendancePair.chart=null;chartEmpty.textContent=message;chartEmpty.hidden=false;chartScroll.classList.remove("has-data");chartDownload.disabled=true;const ctx=chartCanvas.getContext("2d");ctx.clearRect(0,0,chartCanvas.width,chartCanvas.height)}
  async function attendanceLoadDepartmentRatesFinal(){
    if(!state.attendanceSessionId){attendanceSetChartEmpty("교육 회차를 선택하세요.");return}const token=++chartRequestToken;chartEmpty.hidden=false;chartEmpty.textContent="출석 현황을 계산하는 중입니다.";chartScroll.classList.remove("has-data");chartDownload.disabled=true;
    const rateSession=state.attendancePair.round2Session||state.attendancePair.round1Session||attendanceAnchorSession();const result=await db.rpc("attendance_department_rates",{p_session_id:rateSession?.id||state.attendanceSessionId});if(token!==chartRequestToken)return;if(result.error){console.error("[교육 출결관리] 출석 현황 조회 실패",result.error);attendanceSetChartEmpty("교육 출석 현황을 불러오지 못했습니다.");return}
    const payload=result.data||{},rows=Array.isArray(payload.departments)?payload.departments:[];rows.sort((a,b)=>Number(b.display_rate||0)-Number(a.display_rate||0)||String(a.department_name||"").localeCompare(String(b.department_name||""),"ko"));state.attendancePair.chart={...payload,departments:rows};
    const anchor=attendanceAnchorSession();
    const month=Number(String(anchor?.session_date||"").slice(5,7));
    const chartTitle=`${month||""}${month?"월 ":""}정기안전보건교육 집체 참석율`;
    byId("attendanceRateTitle").textContent=chartTitle;
    byId("attendanceRateDescription").textContent="";
    byId("attendanceRateLegend").textContent="";
    if(!rows.length){attendanceSetChartEmpty("교육대상이 있는 부서가 없습니다.");return}chartEmpty.hidden=true;chartScroll.classList.add("has-data");chartDownload.disabled=false;if(chartIsOpen())drawAttendanceChart(false);
  }
  function attendanceChartTitle(){
    const month=Number(String(attendanceAnchorSession()?.session_date||"").slice(5,7));
    return `${month||""}${month?"월 ":""}정기안전보건교육 집체 참석율`;
  }
  function attendanceChartDepartmentLabel(label,maxChars=18){
    const text=String(label||"미지정").trim()||"미지정";
    return [...text].length>maxChars?[...text].slice(0,Math.max(1,maxChars-1)).join("")+"…":text;
  }
  function attendanceChartRoundRect(ctx,x,y,width,height,radius){
    const r=Math.max(0,Math.min(radius,width/2,height/2));
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+width-r,y);
    ctx.quadraticCurveTo(x+width,y,x+width,y+r);
    ctx.lineTo(x+width,y+height);
    ctx.lineTo(x,y+height);
    ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  }
  function drawAttendanceChart(download=false){
    const payload=state.attendancePair.chart;
    if(!payload?.departments?.length)return null;
    const rows=payload.departments;
    const logicalWidth=1920,logicalHeight=1080;
    const canvas=download?document.createElement("canvas"):chartCanvas;
    canvas.width=logicalWidth;
    canvas.height=logicalHeight;
    canvas.style.width="100%";
    canvas.style.height="auto";
    canvas.style.maxWidth="1920px";
    const ctx=canvas.getContext("2d");
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,logicalWidth,logicalHeight);
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,logicalWidth,logicalHeight);

    const title=attendanceChartTitle();
    ctx.fillStyle="#172033";
    ctx.font="800 38px Pretendard, 'Noto Sans KR', sans-serif";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillText(title,logicalWidth/2,68);

    const left=58,right=58,top=250,bottom=300;
    const chartW=logicalWidth-left-right;
    const chartH=logicalHeight-top-bottom;
    const groupW=chartW/Math.max(1,rows.length);
    const barW=Math.max(18,Math.min(86,groupW*.48));
    const valueFont=Math.max(10,Math.min(18,groupW*.21));
    const departmentFont=Math.max(11,Math.min(16,groupW*.21));
    const dense=groupW<74;

    rows.forEach((row,index)=>{
      const center=left+groupW*(index+.5);
      const value=Math.max(0,Math.min(100,Number(row.display_rate||0)));
      const height=value/100*chartH;
      const y=top+chartH-height;
      const x=center-barW/2;

      ctx.fillStyle="#2f6fed";
      attendanceChartRoundRect(ctx,x,y,barW,height,Math.min(13,barW/2,height/2));
      ctx.fill();

      const valueText=Number.isInteger(value)?`${value.toFixed(0)}%`:`${value.toFixed(1)}%`;
      const stagger=dense?(index%3)*Math.max(16,valueFont*1.05):0;
      const labelY=Math.max(130+valueFont,y-16-stagger);
      ctx.save();
      ctx.translate(center,labelY);
      if(dense)ctx.rotate(-Math.PI/4);
      ctx.font=`800 ${valueFont}px Pretendard, 'Noto Sans KR', sans-serif`;
      ctx.textAlign="center";
      ctx.textBaseline="bottom";
      const textWidth=ctx.measureText(valueText).width;
      ctx.fillStyle="rgba(255,255,255,.94)";
      const padX=5,padY=3;
      ctx.fillRect(-textWidth/2-padX,-valueFont-padY,textWidth+padX*2,valueFont+padY*2);
      ctx.fillStyle="#172033";
      ctx.fillText(valueText,0,0);
      ctx.restore();

      const maxDepartmentChars=Math.max(5,Math.min(18,Math.floor((groupW*1.28)/Math.max(6,departmentFont*.58))));
      const department=attendanceChartDepartmentLabel(row.department_name,maxDepartmentChars);
      ctx.save();
      ctx.translate(center+Math.min(10,barW*.18),top+chartH+38);
      ctx.rotate(-Math.PI/4);
      ctx.fillStyle="#344054";
      ctx.font=`800 ${departmentFont}px Pretendard, 'Noto Sans KR', sans-serif`;
      ctx.textAlign="right";
      ctx.textBaseline="middle";
      ctx.fillText(department,0,0,Math.max(110,Math.min(230,bottom-55)));
      ctx.restore();
    });
    return canvas;
  }
  chartToggle.onclick=()=>setChartOpen(!chartIsOpen());chartDownload.onclick=()=>{const canvas=drawAttendanceChart(true);if(!canvas)return;const title=attendanceChartTitle().replace(/[\/:*?"<>|]/g,"_");const link=document.createElement("a");link.download=`${title}_1920x1080.png`;link.href=canvas.toDataURL("image/png",1);link.click()};
  setChartOpen(localStorage.getItem("attendance_chart_open")==="1");window.addEventListener("resize",()=>{clearTimeout(chartResizeTimer);chartResizeTimer=setTimeout(()=>{if(chartIsOpen()&&state.attendancePair.chart)drawAttendanceChart(false)},180)});
  window.attendanceLoadDepartmentRates=attendanceLoadDepartmentRatesFinal;

  // Multi-person actions retain the current page/filter; no window scroll command is used.
  const previousAttendanceSubmitConfirm=window.attendanceSubmitConfirm;
  byId("attendanceConfirmSubmit").onclick=()=>previousAttendanceSubmitConfirm();

  // Rebind session and menu actions after the final overrides.
  byId("attendanceRefreshButton").onclick=async()=>{const selected=await attendanceLoadSessions({preferredId:state.attendanceSessionId,autoSelect:true});if(selected)await attendanceLoadBoard({silent:true});showToast("최신 데이터로 새로고침했습니다.")};
  byId("attendanceResyncButton").onclick=attendanceResyncExistingRecords;
})();


(function participantManagementModule(){
  "use strict";
  const byId=id=>document.getElementById(id);
  const PARTICIPANT_PAGE_SIZE=22;
  const paging=window.platformPaging||{participants:1,employeePicker:1};window.platformPaging=paging;
  state.participantSelected=state.participantSelected||new Set();
  state.employeePickerSelected=state.employeePickerSelected||new Set();
  state.participantChannel=state.participantChannel||null;
  state.participantRealtimeTimer=state.participantRealtimeTimer||null;
  state.participantLocalMutationUntil=state.participantLocalMutationUntil||0;

  function participantMode(){return categoryMeta(state.currentEducation?.category_id).type}
  function participantCommonDate(){return state.currentEducation?.first_session_date||state.currentEducation?.conducted_date||''}
  function participantDate1(row){return row.individual_date_1||row.education_date||''}
  function participantDate2(row){return row.individual_date_2||row.education_date_2||''}
  function participantSort(rows){
    return [...(rows||[])].sort((a,b)=>
      String(a.department_name||'').localeCompare(String(b.department_name||''),'ko')||
      String(a.employee_name||'').localeCompare(String(b.employee_name||''),'ko')
    );
  }
  function participantFilteredRows(){
    const q=byId('participantSearch').value.trim().toLowerCase();
    return participantSort(state.participants).filter(x=>!q||`${x.employee_name||''} ${x.department_name||''}`.toLowerCase().includes(q));
  }
  function participantPageInfo(rows){
    const pages=Math.max(1,Math.ceil(rows.length/PARTICIPANT_PAGE_SIZE));
    paging.participants=Math.min(Math.max(1,paging.participants||1),pages);
    const start=(paging.participants-1)*PARTICIPANT_PAGE_SIZE;
    return {page:paging.participants,pages,start,items:rows.slice(start,start+PARTICIPANT_PAGE_SIZE)};
  }
  function renderParticipantPager(total,renderFn){
    const box=byId('participantPagination'),pages=Math.max(1,Math.ceil(total/PARTICIPANT_PAGE_SIZE));box.replaceChildren();
    paging.participants=Math.min(Math.max(1,paging.participants||1),pages);
    if(total<=PARTICIPANT_PAGE_SIZE){box.hidden=true;return}
    box.hidden=false;
    const summary=document.createElement('span');summary.className='platform-page-summary';summary.textContent=`총 ${total}건 · ${paging.participants}/${pages}페이지`;box.appendChild(summary);
    const add=(label,page,active=false,disabled=false)=>{const b=document.createElement('button');b.type='button';b.className='platform-page-button'+(active?' active':'');b.textContent=label;b.disabled=disabled;if(!disabled&&!active)b.onclick=()=>{paging.participants=page;renderFn()};box.appendChild(b)};
    add('이전',paging.participants-1,false,paging.participants===1);
    for(let p=1;p<=pages;p++)add(String(p),p,p===paging.participants,false);
    add('다음',paging.participants+1,false,paging.participants===pages);
  }
  function currentParticipantPageItems(){return participantPageInfo(participantFilteredRows()).items}

  function addHeader(label,className=''){
    const th=document.createElement('th');th.className=`center ${className}`.trim();th.textContent=label;byId('participantTableHeader').appendChild(th);return th;
  }
  function renderParticipantHeader(){
    const mode=participantMode(),header=byId('participantTableHeader'),table=byId('participantDataTable');header.replaceChildren();table.dataset.mode=mode;
    if(mode==='regular'||mode==='special'){
      const th=addHeader('','participant-select-col');const input=document.createElement('input');input.id='participantSelectAll';input.type='checkbox';input.setAttribute('aria-label','현재 페이지 전체 선택');input.onchange=event=>{currentParticipantPageItems().forEach(x=>event.target.checked?state.participantSelected.add(String(x.participant_id)):state.participantSelected.delete(String(x.participant_id)));renderParticipants()};th.appendChild(input);
    }
    if(mode==='regular'){
      addHeader('부서','participant-department-col');addHeader('사원명','participant-name-col');addHeader('교육일자','participant-date-col');addHeader('관리','participant-manage-col');
    }else if(mode==='special'){
      addHeader('부서','participant-department-col');addHeader('사원명','participant-name-col');addHeader('공통 실시일','participant-common-col');
      const first=addHeader('개별 실시일 1','participant-date-col');const mark=document.createElement('span');mark.className='participant-required-mark';mark.textContent='*';first.appendChild(mark);
      addHeader('개별 실시일 2','participant-date-col');addHeader('관리','participant-manage-col');
    }else{
      addHeader('부서','participant-department-col');addHeader('사원명','participant-name-col');addHeader('실시일','participant-common-col');addHeader('관리','participant-manage-col');
    }
  }

  function syncParticipantModeUI(){
    const mode=participantMode(),regular=mode==='regular',special=mode==='special';
    byId('participantSelectionText').hidden=mode==='hiring';
    byId('participantBulkDateButton').hidden=mode==='hiring';
    byId('participantBulkDateButton').textContent=special?'선택 날짜 일괄입력':'선택 교육일 입력';
    byId('participantBulkDateButton').disabled=!state.participantSelected.size;
    // 전체 재직자 등록은 정기안전보건교육에서만 사용합니다.
    byId('assignAllButton').hidden=!regular;
    byId('participantSummaryStrip').hidden=!regular;
    byId('participantCountSummaryCard').hidden=!regular;
    byId('participantCountLabel').textContent='교육 대상자';
  }

  function updateParticipantSelectionUI(){
    const mode=participantMode(),count=state.participantSelected.size;
    byId('participantSelectionText').textContent=`선택 ${count}명`;
    syncParticipantModeUI();
    if(mode==='hiring')return;
    const visible=currentParticipantPageItems(),master=byId('participantSelectAll');if(!master)return;
    const all=visible.length>0&&visible.every(x=>state.participantSelected.has(String(x.participant_id)));
    const some=visible.some(x=>state.participantSelected.has(String(x.participant_id)));
    master.checked=all;master.indeterminate=some&&!all;
  }

  function createDateInput(value,label){
    const input=document.createElement('input');input.type='date';input.className='participant-date-input';input.value=value||'';input.setAttribute('aria-label',label);return input;
  }

  window.renderParticipants=function(){
    const mode=participantMode(),rows=participantFilteredRows(),info=participantPageInfo(rows),body=byId('participantTableBody');
    renderParticipantHeader();body.replaceChildren();
    if(!rows.length){setStatus('participantStatus','등록된 대상자가 없습니다.');renderParticipantPager(0,renderParticipants);updateParticipantSelectionUI();return}
    setStatus('participantStatus','');const fragment=document.createDocumentFragment(),commonDate=participantCommonDate();
    info.items.forEach(x=>{
      const tr=document.createElement('tr');tr.dataset.participantId=String(x.participant_id);
      if(mode==='regular'||mode==='special'){
        const checkTd=document.createElement('td');checkTd.className='center participant-select-col';
        const check=document.createElement('input');check.type='checkbox';check.className='participant-row-check';check.value=String(x.participant_id);check.checked=state.participantSelected.has(String(x.participant_id));
        check.onchange=()=>{check.checked?state.participantSelected.add(check.value):state.participantSelected.delete(check.value);updateParticipantSelectionUI()};checkTd.appendChild(check);tr.appendChild(checkTd);
      }
      addTextCell(tr,x.department_name||'-','center ellipsis',x.department_name||'-');addTextCell(tr,x.employee_name||'-','center');
      if(mode==='regular'){
        const dateTd=document.createElement('td');dateTd.className='center';const dateInput=createDateInput(x.education_date||'',`${x.employee_name||'대상자'} 교육일자`);dateInput.onchange=()=>saveRegularParticipantDate(x,dateInput);dateTd.appendChild(dateInput);tr.appendChild(dateTd);
      }else if(mode==='special'){
        const commonTd=addTextCell(tr,commonDate?formatDateDot(commonDate):'-','center participant-common-date');commonTd.title='교육 등록 화면의 공통 실시일이 모든 대상자에게 동일하게 적용됩니다.';
        const date1Td=document.createElement('td');date1Td.className='center';const date2Td=document.createElement('td');date2Td.className='center';
        const date1=createDateInput(participantDate1(x),`${x.employee_name||'대상자'} 개별 실시일 1 필수`),date2=createDateInput(participantDate2(x),`${x.employee_name||'대상자'} 개별 실시일 2 선택`);
        date1.required=true;date1.setAttribute('aria-required','true');if(!date1.value)date1.setAttribute('aria-invalid','true');
        const save=()=>saveSpecialParticipantDates(x,date1,date2);date1.onchange=save;date2.onchange=save;date1Td.appendChild(date1);date2Td.appendChild(date2);tr.append(date1Td,date2Td);
      }else{
        addTextCell(tr,commonDate?formatDateDot(commonDate):'-','center participant-common-date');
      }
      const manage=document.createElement('td');manage.className='center';const remove=document.createElement('button');remove.type='button';remove.className='mini mini-danger';remove.textContent='삭제';remove.onclick=()=>removeParticipant(x.participant_id,x.employee_name);manage.appendChild(remove);tr.appendChild(manage);fragment.appendChild(tr);
    });
    body.appendChild(fragment);renderParticipantPager(rows.length,renderParticipants);updateParticipantSelectionUI();
  };

  async function syncRegularEducationRange(linkId){
    const link=state.educationLinks.find(item=>Number(item.id)===Number(linkId))||state.currentEducation;if(!link||categoryMeta(link.category_id).type!=='regular')return null;
    const result=await db.from('education_participants').select('education_date').eq('education_link_id',Number(linkId));if(result.error){console.warn('[정기교육 개별기간 동기화]',result.error);return null}
    const all=[...new Set((result.data||[]).map(row=>row.education_date).filter(Boolean))].sort();
    const withoutSessions=all.filter(date=>date!==link.first_session_date&&date!==link.second_session_date),effective=withoutSessions.length?withoutSessions:all;
    const start=effective[0]||null,end=effective[effective.length-1]||null;
    const update=await db.from('education_links').update({individual_start_date:start,individual_end_date:end}).eq('id',Number(linkId));if(update.error){console.warn('[정기교육 개별기간 저장]',update.error);return null}
    link.individual_start_date=start;link.individual_end_date=end;if(start)state.educationIndividualRanges.set(String(linkId),{start,end:end||start});else state.educationIndividualRanges.delete(String(linkId));
    return {start,end};
  }
  window.syncRegularEducationRange=syncRegularEducationRange;

  async function saveRegularParticipantDate(participant,input){
    if(input.disabled)return;const previous=participant.education_date||'';input.disabled=true;input.classList.add('is-saving');state.participantLocalMutationUntil=Date.now()+1600;
    const {data,error}=await db.rpc('update_education_participant_date',{p_education_link_id:Number(state.currentEducation.id),p_participant_id:Number(participant.participant_id),p_education_date:input.value||null,p_expected_updated_at:participant.updated_at||null});
    input.disabled=false;input.classList.remove('is-saving');
    if(error){console.error('[교육 대상자 관리] 개인 교육일 저장 실패',error);input.value=previous;input.classList.add('is-conflict');setTimeout(()=>input.classList.remove('is-conflict'),1200);const conflict=String(error.message||'').includes('다른 관리자가');showToast(conflict?'다른 관리자가 먼저 수정했습니다. 최신 정보를 다시 불러옵니다.':'교육일자를 저장하지 못했습니다.');if(conflict)await reloadParticipants({silent:true});return}
    const row=Array.isArray(data)?data[0]:data;participant.education_date=row?.education_date??(input.value||null);participant.updated_at=row?.updated_at||participant.updated_at;input.value=participant.education_date||'';await syncRegularEducationRange(state.currentEducation.id);showToast('교육일자를 저장했습니다.');
  }

  function missingFunction(error){const raw=String(error?.message||'').toLowerCase();return error?.code==='PGRST202'||raw.includes('could not find the function')||raw.includes('function')&&raw.includes('not exist')}
  function missingSecondDateColumn(error){const raw=String(error?.message||'').toLowerCase();return error?.code==='PGRST204'||error?.code==='42703'||raw.includes('education_date_2')&&(raw.includes('column')||raw.includes('schema cache'))}
  function secondDateConfigurationError(){const error=new Error('두 번째 개별 실시일 저장 항목이 아직 서버에 준비되지 않았습니다.');error.userMessage='개별 실시일 2 저장을 위해 education_participants.education_date_2 열 또는 update_education_participant_dates_v2 RPC가 필요합니다.';return error}

  async function persistSpecialDates(participant,date1,date2){
    if(!date1){const error=new Error('first date required');error.userMessage='개별 실시일 1은 반드시 입력하세요.';throw error}
    if(date2&&date2<date1){const error=new Error('date order');error.userMessage='개별 실시일 2는 개별 실시일 1과 같거나 이후 날짜로 입력하세요.';throw error}
    if(date2&&state.participantSecondDateSupport==='unsupported')throw secondDateConfigurationError();
    const params={p_education_link_id:Number(state.currentEducation.id),p_participant_id:Number(participant.participant_id),p_individual_date_1:date1,p_individual_date_2:date2||null,p_expected_updated_at:participant.updated_at||null};
    const rpc=await db.rpc('update_education_participant_dates_v2',params);
    if(!rpc.error){state.participantSecondDateSupport='supported';return Array.isArray(rpc.data)?rpc.data[0]:rpc.data}
    if(!missingFunction(rpc.error))throw rpc.error;

    if(state.participantSecondDateSupport!=='unsupported'){
      const direct=await db.from('education_participants').update({education_date:date1,education_date_2:date2||null,updated_at:new Date().toISOString()}).eq('id',Number(participant.participant_id)).eq('education_link_id',Number(state.currentEducation.id)).select('id,education_date,education_date_2,updated_at').single();
      if(!direct.error){state.participantSecondDateSupport='supported';return direct.data}
      if(missingSecondDateColumn(direct.error))state.participantSecondDateSupport='unsupported';
      else if(date2)throw direct.error;
    }
    if(date2)throw secondDateConfigurationError();
    const legacy=await db.rpc('update_education_participant_date',{p_education_link_id:Number(state.currentEducation.id),p_participant_id:Number(participant.participant_id),p_education_date:date1,p_expected_updated_at:participant.updated_at||null});
    if(legacy.error)throw legacy.error;return Array.isArray(legacy.data)?legacy.data[0]:legacy.data;
  }

  async function saveSpecialParticipantDates(participant,date1Input,date2Input){
    const previous1=participantDate1(participant),previous2=participantDate2(participant),date1=date1Input.value,date2=date2Input.value;
    if(!date1){date1Input.value=previous1;date1Input.setAttribute('aria-invalid','true');showToast('개별 실시일 1은 반드시 입력하세요.');return}
    date1Input.removeAttribute('aria-invalid');date1Input.disabled=true;date2Input.disabled=true;date1Input.classList.add('is-saving');date2Input.classList.add('is-saving');state.participantLocalMutationUntil=Date.now()+2200;
    try{
      const row=await persistSpecialDates(participant,date1,date2);participant.education_date=row?.education_date??date1;participant.individual_date_1=participant.education_date;participant.education_date_2=(row?.education_date_2??date2)||null;participant.individual_date_2=participant.education_date_2;participant.updated_at=row?.updated_at||participant.updated_at;date1Input.value=participantDate1(participant);date2Input.value=participantDate2(participant);showToast('개별 실시일을 저장했습니다.');
    }catch(error){console.error('[특별안전교육 개별 실시일 저장]',error);date1Input.value=previous1;date2Input.value=previous2;date1Input.setAttribute('aria-invalid',String(!previous1));showToast(error.userMessage||friendlyErrorMessage(error,'개별 실시일 저장'));if(error.code==='EDIT_CONFLICT')await reloadParticipants({silent:true})}
    finally{date1Input.disabled=false;date2Input.disabled=false;date1Input.classList.remove('is-saving');date2Input.classList.remove('is-saving')}
  }

  function openParticipantDateModal(){
    const mode=participantMode();if(mode==='hiring'||!state.participantSelected.size)return;
    byId('participantDateForm').reset();byId('participantDateError').textContent='';
    const special=mode==='special',selected=state.participants.filter(x=>state.participantSelected.has(String(x.participant_id)));
    byId('participantBulkDate2Field').hidden=!special;byId('modalTitle11').textContent=special?'선택 대상자 개별 실시일 일괄입력':'선택 대상자 교육일 입력';byId('participantBulkDateLabel').textContent=special?'개별 실시일 1':'교육일자';byId('participantDateSubmitButton').textContent='선택 대상자에 입력';
    const firstDates=[...new Set(selected.map(x=>special?participantDate1(x):x.education_date).filter(Boolean))];byId('participantBulkDate').value=firstDates.length===1?firstDates[0]:'';
    if(special){const secondDates=[...new Set(selected.map(participantDate2).filter(Boolean))];byId('participantBulkDate2').value=secondDates.length===1?secondDates[0]:''}
    openModal('participantDateModal');
  }

  async function applyBulkParticipantDate(event){
    event.preventDefault();const mode=participantMode(),date1=byId('participantBulkDate').value,date2=byId('participantBulkDate2').value,submit=event.submitter||byId('participantDateSubmitButton');byId('participantDateError').textContent='';
    if(!date1){byId('participantDateError').textContent=mode==='special'?'개별 실시일 1을 입력하세요.':'교육일자를 입력하세요.';return}
    if(date2&&date2<date1){byId('participantDateError').textContent='개별 실시일 2는 개별 실시일 1과 같거나 이후 날짜로 입력하세요.';return}
    if(mode==='regular'){
      const ids=[...state.participantSelected].map(Number).filter(Number.isFinite);if(!ids.length){closeModal('participantDateModal');return}submit.disabled=true;state.participantLocalMutationUntil=Date.now()+2000;
      const {data,error}=await db.rpc('bulk_update_education_participant_dates',{p_education_link_id:Number(state.currentEducation.id),p_participant_ids:ids,p_education_date:date1});submit.disabled=false;
      if(error){console.error('[교육 대상자 관리] 교육일 일괄 입력 실패',error);byId('participantDateError').textContent=friendlyErrorMessage(error,'교육일 일괄입력');return}
      const updated=new Map((data||[]).map(x=>[String(x.participant_id),x]));state.participants.forEach(x=>{const row=updated.get(String(x.participant_id));if(row){x.education_date=row.education_date;x.updated_at=row.updated_at}});await syncRegularEducationRange(state.currentEducation.id);state.participantSelected.clear();closeModal('participantDateModal');renderParticipants();showToast(`${updated.size||ids.length}명의 교육일자를 입력했습니다.`);return;
    }
    const selectedIds=new Set([...state.participantSelected].map(String)),targets=state.participants.filter(x=>selectedIds.has(String(x.participant_id)));if(!targets.length){byId('participantDateError').textContent='날짜를 입력할 대상자를 선택하세요.';return}
    if(date2&&state.participantSecondDateSupport==='unsupported'){byId('participantDateError').textContent=secondDateConfigurationError().userMessage;return}
    submit.disabled=true;state.participantLocalMutationUntil=Date.now()+Math.max(2400,targets.length*120);let success=0,failed=0,lastError=null;
    for(const participant of targets){
      try{const row=await persistSpecialDates(participant,date1,date2);participant.education_date=row?.education_date??date1;participant.individual_date_1=participant.education_date;participant.education_date_2=(row?.education_date_2??date2)||null;participant.individual_date_2=participant.education_date_2;participant.updated_at=row?.updated_at||participant.updated_at;success++}
      catch(error){console.error('[특별안전교육 선택 일괄입력]',error);failed++;lastError=error;if(error.userMessage)break}
    }
    submit.disabled=false;
    if(failed){renderParticipants();byId('participantDateError').textContent=lastError?.userMessage||`${success}명 저장, ${failed}명 저장 실패했습니다.`;return}
    state.participantSelected.clear();closeModal('participantDateModal');renderParticipants();showToast(`선택한 ${success}명의 개별 실시일을 입력했습니다.`);
  }

  async function loadOptionalSecondDates(educationId,participants){
    if(participantMode()!=='special')return participants;
    if(participants.some(row=>Object.prototype.hasOwnProperty.call(row,'education_date_2')||Object.prototype.hasOwnProperty.call(row,'individual_date_2'))){state.participantSecondDateSupport='supported';return participants}
    const result=await db.from('education_participants').select('id,education_date_2').eq('education_link_id',Number(educationId));
    if(result.error){if(missingSecondDateColumn(result.error))state.participantSecondDateSupport='unsupported';else state.participantSecondDateSupport='unknown';return participants}
    state.participantSecondDateSupport='supported';const map=new Map((result.data||[]).map(row=>[String(row.id),row.education_date_2]));participants.forEach(row=>{row.education_date_2=map.get(String(row.participant_id))||null;row.individual_date_2=row.education_date_2});return participants;
  }

  function unsubscribeParticipantRealtime(){clearTimeout(state.participantRealtimeTimer);state.participantRealtimeTimer=null;if(state.participantChannel){db.removeChannel(state.participantChannel);state.participantChannel=null}}
  function subscribeParticipantRealtime(){
    unsubscribeParticipantRealtime();if(!state.currentEducation?.id)return;
    state.participantChannel=db.channel(`education-participants-${state.currentEducation.id}`).on('postgres_changes',{event:'*',schema:'public',table:'education_participants',filter:`education_link_id=eq.${state.currentEducation.id}`},()=>{
      if(Date.now()<state.participantLocalMutationUntil)return;clearTimeout(state.participantRealtimeTimer);state.participantRealtimeTimer=setTimeout(()=>{const modal=byId('participantModal'),editing=modal&&!modal.hidden&&modal.contains(document.activeElement)&&document.activeElement?.classList?.contains('participant-date-input');if(modal&&!modal.hidden&&!editing)reloadParticipants({silent:true})},280);
    }).subscribe(status=>{if(status==='CHANNEL_ERROR')console.warn('[교육 대상자 관리] 실시간 연결 실패 - 수동 새로고침은 계속 사용할 수 있습니다.')});
  }

  window.reloadParticipants=async function(options={}){
    const silent=Boolean(options.silent);if(!silent)renderSkeleton('participantTableBody',participantMode()==='special'?6:5,7);byId('employeePickerList').replaceChildren();
    const [employees,participantsResult]=await Promise.all([db.rpc('get_current_employees'),db.rpc('get_education_participants',{p_education_link_id:state.currentEducation.id})]);
    if(employees.error||participantsResult.error){console.error('[교육 대상자 관리] 목록 조회 실패',employees.error||participantsResult.error);setStatus('participantStatus','대상자 정보를 불러오지 못했습니다.',true);return}
    state.currentEmployees=participantSort(employees.data||[]);state.currentEmployeeTotal=state.currentEmployees.length;state.participants=participantSort(participantsResult.data||[]);await loadOptionalSecondDates(state.currentEducation.id,state.participants);
    const valid=new Set(state.participants.map(x=>String(x.participant_id)));state.participantSelected=new Set([...state.participantSelected].filter(id=>valid.has(id)));
    const registeredEmployees=new Set(state.participants.map(x=>String(x.employee_id))),currentEmployees=new Set(state.currentEmployees.map(x=>String(x.employee_id)));state.employeePickerSelected=new Set([...state.employeePickerSelected].filter(id=>currentEmployees.has(id)&&!registeredEmployees.has(id)));state.educationParticipantCounts.set(String(state.currentEducation.id),state.participants.length);
    byId('participantCount').textContent=state.participants.length;syncParticipantModeUI();renderEmployeePicker();renderParticipants();if(state.currentView==='education')renderEducationTable();
  };
  window.openParticipants=async function(education){
    state.currentEducation=education;state.participantSelected.clear();state.employeePickerSelected.clear();state.participantSecondDateSupport='unknown';byId('employeePickerSearch').value='';byId('participantSearch').value='';if(window.platformPaging){platformPaging.employeePicker=1;platformPaging.participants=1}
    const mode=categoryMeta(education.category_id).type;byId('participantTitle').textContent=mode==='special'?`${education.title} 대상자 및 개별 실시일`:mode==='hiring'?`${education.title} 대상자 관리`:`${education.title} 대상자 관리`;syncParticipantModeUI();openModal('participantModal');await reloadParticipants();subscribeParticipantRealtime();
  };

  const originalCloseModal=window.closeModal;window.closeModal=function(id){if(id==='participantModal')unsubscribeParticipantRealtime();return originalCloseModal(id)};
  byId('participantBulkDateButton').onclick=openParticipantDateModal;byId('participantDateForm').onsubmit=applyBulkParticipantDate;byId('participantSearch').oninput=debounce(()=>{if(window.platformPaging)platformPaging.participants=1;renderParticipants()},160);

  function selfHistoryType(item){
    if(item?._history_type)return item._history_type;
    if(item.category_id)return categoryMeta(item.category_id).type;
    const categoryText=String(item.education_category||item.category_name||item.education_type||'').replace(/\s+/g,'');
    const titleText=String(item.education_title||'').replace(/\s+/g,'');
    const combined=`${categoryText}${titleText}`;
    if(combined.includes('특별안전교육'))return 'special';
    if(combined.includes('채용시교육'))return 'hiring';
    const matched=state.categories.find(category=>{
      const name=String(category.category_name||'').replace(/\s+/g,'');
      return name&&(name===categoryText||name===titleText||categoryText.includes(name)||titleText.includes(name));
    });
    return matched?categoryMeta(matched.id).type:'regular';
  }
  function firstHistoryValue(item,keys){for(const key of keys){const value=item?.[key];if(value)return String(value).slice(0,10)}return ''}
  function historyPersonalDate(item){return firstHistoryValue(item,['_personal_date','participant_education_date','participant_date','personal_education_date','individual_education_date','employee_education_date','individual_date_1','education_date','actual_education_date','training_date','completion_date'])}
  function historyPersonalDate2(item){return firstHistoryValue(item,['_personal_date_2','participant_education_date_2','participant_date_2','personal_education_date_2','individual_education_date_2','employee_education_date_2','individual_date_2','education_date_2'])}
  function historyCommonDate(item){return firstHistoryValue(item,['common_education_date','first_session_date','conducted_date'])}
  function historyLinkId(item){
    const explicit=[item.education_link_id,item.link_id,item.training_link_id,item.education_id].find(value=>value!==undefined&&value!==null&&value!=='');
    if(explicit!==undefined)return String(explicit);
    const type=selfHistoryType(item),title=String(item.education_title||'').trim(),category=String(item.education_category||item.category_name||'').trim(),common=historyCommonDate(item);
    const candidates=state.educationLinks.filter(link=>categoryMeta(link.category_id).type===type);
    const matched=candidates.find(link=>{
      const sameTitle=title&&String(link.title||'').trim()===title;
      const meta=categoryMeta(link.category_id),sameCategory=category&&(meta.label===category||meta.category?.category_name===category);
      const linkDate=String(link.first_session_date||link.conducted_date||'').slice(0,10);
      return (sameTitle||sameCategory)&&(!common||linkDate===common);
    })||candidates.find(link=>title&&String(link.title||'').trim()===title);
    return matched?String(matched.id):'';
  }
  function historyLinkRow(link,participant,existing={}){
    const meta=categoryMeta(link.category_id),linkId=String(link.id);
    return {
      ...existing,
      _history_link_id:linkId,
      _history_type:meta.type,
      category_id:link.category_id,
      education_link_id:link.id,
      education_title:existing.education_title||link.title||meta.label||'-',
      education_category:existing.education_category||meta.label||meta.category?.category_name||'-',
      category_name:existing.category_name||meta.label||meta.category?.category_name||'-',
      first_session_date:link.first_session_date||existing.first_session_date||null,
      second_session_date:link.second_session_date||existing.second_session_date||null,
      conducted_date:link.conducted_date||existing.conducted_date||null,
      common_education_date:link.first_session_date||link.conducted_date||existing.common_education_date||null,
      result_report_url:link.result_report_url||existing.result_report_url||null,
      _personal_date:participant?.education_date||historyPersonalDate(existing)||null,
      _personal_date_2:participant?.education_date_2||historyPersonalDate2(existing)||null,
      _target_status:participant?.target_status||existing._target_status||existing.target_status||null,
      _exclusion_reason:participant?.exclusion_reason||existing._exclusion_reason||existing.exclusion_reason||existing.non_target_reason||null
    };
  }
  async function enrichSelfHistoryPersonalDates(rows,employeeId){
    const prepared=(rows||[]).map(item=>({...item,_history_link_id:historyLinkId(item)}));
    if(!employeeId)return prepared;
    const existingByLink=new Map();
    prepared.forEach(item=>{if(item._history_link_id)existingByLink.set(String(item._history_link_id),item)});
    const merged=new Map();
    const links=[...(state.educationLinks||[])];
    for(let start=0;start<links.length;start+=8){
      const batch=links.slice(start,start+8);
      const results=await Promise.all(batch.map(link=>db.rpc('get_education_participants',{p_education_link_id:Number(link.id)})));
      results.forEach((result,index)=>{
        if(result.error){console.warn('[일반직원 교육이력 동기화]',result.error);return}
        const link=batch[index];
        const participant=(result.data||[]).find(item=>Number(item.employee_id)===Number(employeeId));
        if(!participant)return;
        const linkId=String(link.id);
        merged.set(linkId,historyLinkRow(link,participant,existingByLink.get(linkId)||{}));
      });
    }
    if(!merged.size){
      let result=await db.from('education_participants')
        .select('education_link_id,education_date,education_date_2,target_status,exclusion_reason')
        .eq('employee_id',Number(employeeId));
      if(result.error&&missingSecondDateColumn(result.error))result=await db.from('education_participants')
        .select('education_link_id,education_date,target_status,exclusion_reason')
        .eq('employee_id',Number(employeeId));
      if(!result.error)(result.data||[]).forEach(participant=>{
        const linkId=String(participant.education_link_id||''),link=links.find(item=>String(item.id)===linkId);
        if(link)merged.set(linkId,historyLinkRow(link,participant,existingByLink.get(linkId)||{}));
      });
    }
    prepared.forEach((item,index)=>{
      const linkId=String(item._history_link_id||'');
      if(linkId&&merged.has(linkId))return;
      const link=links.find(row=>String(row.id)===linkId);
      if(link)merged.set(linkId,historyLinkRow(link,null,item));
      else merged.set(`rpc-${index}`,item);
    });
    return [...merged.values()];
  }
  function historyIncomplete(item){
    const status=String(item?._target_status||item?.target_status||'').toLowerCase(),reason=monthlyReasonLabel(item?._exclusion_reason||item?.exclusion_reason||item?.non_target_reason||'');
    return reason==='미수료'||['incomplete','not_completed','uncompleted'].includes(status);
  }
  function historyExcluded(item){
    if(historyIncomplete(item))return false;
    const status=String(item?._target_status||item?.target_status||'').toLowerCase();
    return Boolean(item?._exclusion_reason||item?.exclusion_reason||item?.non_target_reason)||['excluded','non_target','not_target'].includes(status);
  }
  function historyExclusionText(item){return monthlyReasonLabel(item?._exclusion_reason||item?.exclusion_reason||item?.non_target_reason||item?.target_status||'비대상')}
  function historyDateTime(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||'').slice(0,10))?new Date(`${String(value).slice(0,10)}T00:00:00`).getTime()||0:0}
  function historyEducationPeriodDate(item){return firstHistoryValue(item,['common_education_date','first_session_date','conducted_date'])||historyPersonalDate(item)}
  function historyLatestTime(item){
    const values=[historyPersonalDate2(item),historyPersonalDate(item),historyEducationPeriodDate(item),item.second_session_date].filter(Boolean);
    return Math.max(0,...values.map(historyDateTime));
  }
  function selfHistoryDateLines(item,type){
    if(historyIncomplete(item))return ['미수료'];
    if(historyExcluded(item))return [`비대상(${historyExclusionText(item)})`];
    if(type==='special'){
      const lines=[],common=historyCommonDate(item),first=historyPersonalDate(item),second=historyPersonalDate2(item);
      if(common)lines.push(`(공통) ${formatDateDot(common)}`);
      if(first)lines.push(`(개별) ${formatDateDot(first)}`);
      if(second)lines.push(`(개별) ${formatDateDot(second)}`);
      return lines.length?lines:['일자 미입력'];
    }
    if(type==='hiring'){
      const date=historyPersonalDate(item)||historyCommonDate(item);
      return [date?formatDateDot(date):'일자 미입력'];
    }
    const date=historyPersonalDate(item);
    return [date?formatDateDot(date):'일자 미입력'];
  }
  function appendHistoryDateCell(tr,item,type){
    const td=document.createElement('td');td.className='center self-history-date';
    selfHistoryDateLines(item,type).forEach(text=>{const line=document.createElement('span');line.className='self-history-date-line'+(text.startsWith('비대상')?' self-history-excluded':'');line.textContent=text;td.appendChild(line)});
    tr.appendChild(td);return td;
  }
  function appendHistoryReportCell(tr,item){
    const report=document.createElement('td');report.className='center';
    if(validUrl(item.result_report_url)){const a=document.createElement('a');a.className='download-link';a.textContent='결과보고서';a.href=item.result_report_url;a.target='_blank';a.rel='noopener noreferrer';report.appendChild(a)}
    else{const p=document.createElement('span');p.className='progress';p.textContent='보고서 미등록';report.appendChild(p)}
    tr.appendChild(report);
  }
  function historyTitle(item,type){
    if(type==='special')return item.education_category||item.category_name||item.education_title||'-';
    return item.education_title||item.education_category||item.category_name||'-';
  }
  function renderHistorySection(bodyId,statusId,rows,type){
    const body=byId(bodyId),status=byId(statusId);body.replaceChildren();if(status)status.replaceChildren();
    const sorted=[...(rows||[])].sort((a,b)=>{
      if(type==='regular'){
        const periodDiff=historyDateTime(historyEducationPeriodDate(b))-historyDateTime(historyEducationPeriodDate(a));
        if(periodDiff)return periodDiff;
      }
      return historyLatestTime(b)-historyLatestTime(a);
    });
    if(!sorted.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.className='self-history-empty';td.textContent='등록된 교육이력이 없습니다.';tr.appendChild(td);body.appendChild(tr);return}
    const fragment=document.createDocumentFragment();sorted.forEach(item=>{const tr=document.createElement('tr');addTextCell(tr,historyTitle(item,type),'center self-history-title-cell',historyTitle(item,type));appendHistoryDateCell(tr,item,type);appendHistoryReportCell(tr,item);fragment.appendChild(tr)});body.appendChild(fragment);
  }
  function regularHalfGroups(rows){
    const groups=new Map();
    (rows||[]).forEach(item=>{
      const date=historyEducationPeriodDate(item);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
      const year=Number(date.slice(0,4)),month=Number(date.slice(5,7)),half=month<=6?1:2,key=year*10+half;
      if(!groups.has(key))groups.set(key,{key,year,half,label:`${String(year).slice(-2)}년 ${half===1?'상반기':'하반기'}`,rows:[],latest:0});
      const group=groups.get(key);group.rows.push(item);group.latest=Math.max(group.latest,historyLatestTime(item));
    });
    return [...groups.values()].sort((a,b)=>b.key-a.key);
  }
  function renderRegularHalfPagination(groups){
    const box=byId('selfHistoryHalfPagination');box.replaceChildren();
    if(groups.length<=1){box.hidden=true;return}box.hidden=false;
    groups.forEach((group,index)=>{const button=document.createElement('button');button.type='button';button.className='platform-page-button'+(index===state.selfHistoryHalfIndex?' active':'');button.textContent=group.label;button.onclick=()=>{state.selfHistoryHalfIndex=index;renderSelfHistory()};box.appendChild(button)});
  }
  function latestCompletedHalfKey(referenceDate=new Date()){
    const year=referenceDate.getFullYear(),month=referenceDate.getMonth()+1;
    return month>=7?year*10+1:(year-1)*10+2;
  }
  function defaultCompletedHalfIndex(groups,referenceDate=new Date()){
    if(!groups.length)return 0;
    const completedKey=latestCompletedHalfKey(referenceDate);
    const exactIndex=groups.findIndex(group=>group.key===completedKey);
    if(exactIndex>=0)return exactIndex;
    const olderIndex=groups.findIndex(group=>group.key<completedKey);
    return olderIndex>=0?olderIndex:0;
  }
  function renderSelfHistory(){
    const regular=state.selfHistoryRows.filter(item=>selfHistoryType(item)==='regular'),special=state.selfHistoryRows.filter(item=>selfHistoryType(item)==='special'),hiring=state.selfHistoryRows.filter(item=>selfHistoryType(item)==='hiring');
    const regularSection=byId('selfHistoryRegularHeading')?.closest('.self-history-section');
    if(regularSection)regularSection.hidden=!state.isAdmin;
    byId('selfHistoryRegularHeading').textContent='정기안전보건교육';
    byId('selfHistoryHalfPagination').replaceChildren();byId('selfHistoryHalfPagination').hidden=true;
    if(state.isAdmin)renderHistorySection('selfHistoryRegularBody','selfHistoryRegularStatus',regular,'regular');
    else{byId('selfHistoryRegularBody').replaceChildren();byId('selfHistoryRegularStatus').replaceChildren()}
    renderHistorySection('selfHistorySpecialBody','selfHistorySpecialStatus',special,'special');
    renderHistorySection('selfHistoryHiringBody','selfHistoryHiringStatus',hiring,'hiring');
  }
  window.renderHistoryRows=function(tbodyId,rows,adminRetired){
    if(!adminRetired){state.selfHistoryRows=[...(rows||[])];state.selfHistoryHalfIndex=-1;renderSelfHistory();return}
    const body=byId(tbodyId),fragment=document.createDocumentFragment();rows.forEach(item=>{const tr=document.createElement('tr');addTextCell(tr,item.education_title,'center ellipsis',item.education_title);addTextCell(tr,scheduleText({...item,category_id:state.categories.find(c=>c.category_name===item.education_category)?.id}),'center');addTextCell(tr,item.education_category,'center');addTextCell(tr,item.completion_label||'이수','center');addTextCell(tr,item.note||'-','center ellipsis',item.note||'-');const report=document.createElement('td');report.className='center';if(validUrl(item.result_report_url)){const a=document.createElement('a');a.className='download-link';a.textContent='결과보고서';a.href=item.result_report_url;a.target='_blank';a.rel='noopener noreferrer';report.appendChild(a)}else{const p=document.createElement('span');p.className='progress';p.textContent='보고서 미등록';report.appendChild(p)}tr.appendChild(report);fragment.appendChild(tr)});body.appendChild(fragment);
  };
})();


(function employeePickerImeSafetyModule(){
  "use strict";
  const input=document.getElementById('employeePickerSearch');
  if(!input)return;

  // 브라우저와 운영체제의 기본 한글 IME 조합을 그대로 사용한다.
  // 입력값을 임의로 변환하지 않고, 조합 중에는 목록을 다시 그리지 않는다.
  input.lang='ko';
  input.inputMode='text';
  input.autocomplete='off';
  input.autocapitalize='none';
  input.spellcheck=false;
  input.setAttribute('aria-label','대상자 성명 또는 부서 검색');
  input.setAttribute('title','한글 또는 영문으로 성명·부서를 검색하세요.');
  input.addEventListener('compositionstart',()=>{input.dataset.imeComposing='true'});
  input.addEventListener('compositionend',()=>{delete input.dataset.imeComposing;requestAnimationFrame(()=>input.dispatchEvent(new Event('input',{bubbles:true})))});
})();



(function compactDateInputModule(){
  "use strict";
  const SELECTOR='input[data-compact-date="true"]';

  function parseCompactDate(value){
    const text=String(value||'').trim();
    if(!text)return '';
    const digits=text.replace(/\D/g,'');
    if(digits.length!==6&&digits.length!==8)return null;
    const shortYear=digits.length===6;
    const year=shortYear?2000+Number(digits.slice(0,2)):Number(digits.slice(0,4));
    const month=Number(digits.slice(shortYear?2:4,shortYear?4:6));
    const day=Number(digits.slice(shortYear?4:6,shortYear?6:8));
    const date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function prepare(input){
    if(!(input instanceof HTMLInputElement)||input.dataset.compactDate==='true')return;
    if(input.type!=='date')return;
    const value=input.value;
    input.type='text';
    input.dataset.compactDate='true';
    input.inputMode='numeric';
    input.autocomplete='off';
    input.maxLength=10;
    input.placeholder='YYMMDD';
    input.setAttribute('pattern','(?:\\d{6}|\\d{8}|\\d{4}-\\d{2}-\\d{2})');
    input.setAttribute('title','날짜 6자리 입력 예: 261010 → 2026-10-10');
    input.value=value;
  }

  function prepareTree(root){
    if(root instanceof HTMLInputElement)prepare(root);
    root.querySelectorAll?.('input[type="date"]').forEach(prepare);
  }

  function normalize(input,{notify=true}={}){
    if(!input?.matches?.(SELECTOR))return true;
    const normalized=parseCompactDate(input.value);
    if(normalized===null){
      input.setAttribute('aria-invalid','true');
      if(notify)showToast('날짜를 261010처럼 6자리로 입력하세요.');
      return false;
    }
    input.removeAttribute('aria-invalid');
    input.value=normalized;
    return true;
  }

  prepareTree(document);
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
    if(node.nodeType===Node.ELEMENT_NODE)prepareTree(node);
  })));
  observer.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('input',event=>{
    const input=event.target;if(!input?.matches?.(SELECTOR))return;
    const raw=String(input.value||'');
    const cleaned=raw.replace(/[^0-9-]/g,'').slice(0,10);
    if(cleaned!==raw)input.value=cleaned;
    input.removeAttribute('aria-invalid');
  },true);
  document.addEventListener('change',event=>{
    const input=event.target;if(!input?.matches?.(SELECTOR))return;
    if(!normalize(input)){event.preventDefault();event.stopImmediatePropagation();input.focus()}
  },true);
  document.addEventListener('blur',event=>{
    const input=event.target;if(input?.matches?.(SELECTOR)&&input.value)normalize(input,{notify:false});
  },true);
  document.addEventListener('submit',event=>{
    const invalid=[...event.target.querySelectorAll?.(SELECTOR)||[]].find(input=>!normalize(input,{notify:false}));
    if(invalid){event.preventDefault();event.stopImmediatePropagation();invalid.focus();showToast('날짜를 261010처럼 6자리로 입력하세요.')}
  },true);
})();


(function stableRuntime(){
  "use strict";
  const byId=id=>document.getElementById(id);
  const bind=(id,event,handler)=>{const el=byId(id);if(el)el[event]=handler};
  const modalTriggers=new Map();

  function topOpenModal(){return [...document.querySelectorAll('.modal-backdrop:not([hidden])')].at(-1)||null}
  function focusable(dialog){return [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.getClientRects().length)}
  const openModalBase=window.openModal;
  window.openModal=function(id){
    const backdrop=byId(id);if(!backdrop)return;
    modalTriggers.set(id,document.activeElement);
    openModalBase(id);backdrop.setAttribute('aria-hidden','false');
    const dialog=backdrop.querySelector('[role="dialog"]')||backdrop.querySelector('.modal');
    requestAnimationFrame(()=>{const items=dialog?focusable(dialog):[];(items[0]||dialog)?.focus?.()});
  };
  const closeModalBase=window.closeModal;
  window.closeModal=function(id){
    const backdrop=byId(id);if(!backdrop)return;
    closeModalBase(id);backdrop.setAttribute('aria-hidden','true');
    const trigger=modalTriggers.get(id);modalTriggers.delete(id);requestAnimationFrame(()=>{if(!trigger?.focus)return;try{trigger.focus({preventScroll:true})}catch(_){trigger.focus()}});
  };
  document.addEventListener('click',event=>{
    const close=event.target.closest?.('[data-close]');if(close){event.preventDefault();closeModal(close.dataset.close);return}
    if(event.target.classList?.contains('modal-backdrop'))closeModal(event.target.id);
  },true);
  document.addEventListener('keydown',event=>{
    const backdrop=topOpenModal();if(!backdrop)return;
    if(event.key==='Escape'){event.preventDefault();closeModal(backdrop.id);return}
    if(event.key!=='Tab')return;
    const dialog=backdrop.querySelector('[role="dialog"]')||backdrop.querySelector('.modal'),items=dialog?focusable(dialog):[];
    if(!items.length){event.preventDefault();dialog?.focus();return}
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  },true);

  function syncEmployeeTabs(tab){
    const active=tab==='active';
    [['activeEmployeeTab',active],['retiredEmployeeTab',!active]].forEach(([id,on])=>{const el=byId(id);el?.setAttribute('aria-selected',String(on));if(el)el.tabIndex=on?0:-1});
  }
  const loadEmployeeTabBase=window.loadEmployeeTab;
  window.loadEmployeeTab=async function(tab){const result=await loadEmployeeTabBase(tab);syncEmployeeTabs(state.employeeTab);return result};  function enableTabKeys(selector,activate){
    const list=document.querySelector(selector);if(!list)return;
    list.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...list.querySelectorAll('[role="tab"]')],current=Math.max(0,tabs.indexOf(document.activeElement));let next=current;if(event.key==='ArrowRight')next=(current+1)%tabs.length;if(event.key==='ArrowLeft')next=(current-1+tabs.length)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;event.preventDefault();tabs[next].focus();activate(tabs[next].id)});
  }
  enableTabKeys('#employeeView .tabs',id=>loadEmployeeTab(id==='retiredEmployeeTab'?'retired':'active'));
  syncEmployeeTabs(state.employeeTab||'active');

  async function handleLogout(){
    const result=await db.auth.signOut();if(result.error){showToast(friendlyErrorMessage(result.error,'로그아웃'));return}
    window.location.replace('/');
  }
  const normalizeTime=input=>{let value=String(input.value||'').trim().replace(/[^0-9:]/g,'');if(/^\d{3,4}$/.test(value))value=value.padStart(4,'0').replace(/^(\d{2})(\d{2})$/,'$1:$2');if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return false;input.value=value;return true};

  bind('loginButton','onclick',()=>window.location.assign('/login.html'));bind('logoutButton','onclick',handleLogout);
  bind('employeeMenuButton','onclick',()=>showView('employees'));bind('departmentMenuButton','onclick',()=>showView('departments'));
  bind('attendanceSessionSelect','onchange',async event=>{state.attendanceSessionId=event.target.value;state.attendanceSelected.clear();state.attendancePage=1;if(state.attendanceSessionId)localStorage.setItem(ATTENDANCE_CONFIG.lastSessionKey,state.attendanceSessionId);else localStorage.removeItem(ATTENDANCE_CONFIG.lastSessionKey);attendanceRenderSessionInfo();await attendanceLoadBoard();attendanceSubscribeRealtime()});
  bind('attendanceNewSessionButton','onclick',()=>attendanceOpenSessionForm());bind('attendanceEditSessionButton','onclick',()=>attendanceOpenSessionForm(state.attendanceSessions.find(x=>String(x.id)===String(state.attendanceSessionId))));bind('attendanceResyncButton','onclick',attendanceResyncExistingRecords);
  ['attendanceSessionStart','attendanceSessionEnd'].forEach(id=>bind(id,'onfocus',event=>event.target.select()));
  bind('attendanceSessionStart','onblur',()=>{if(normalizeTime(byId('attendanceSessionStart')))attendanceSyncSessionTimes()});bind('attendanceSessionEnd','onblur',()=>normalizeTime(byId('attendanceSessionEnd')));
  bind('attendanceSessionStart','onchange',()=>{if(normalizeTime(byId('attendanceSessionStart')))attendanceSyncSessionTimes()});bind('attendanceSessionEnd','onchange',()=>normalizeTime(byId('attendanceSessionEnd')));
  bind('attendanceSessionForm','onsubmit',attendanceSaveSession);bind('attendanceCsvButton','onclick',attendanceDownloadCsv);bind('attendanceMissingCsvButton','onclick',attendanceDownloadMissingCsv);
  bind('attendanceClearSelectionButton','onclick',attendanceResetSelectedLogs);bind('attendanceDeleteSelectedButton','onclick',attendanceDeleteSelected);bind('attendanceStartPeopleButton','onclick',()=>attendanceOpenConfirm('bulk_start',attendanceBulkRows()));bind('attendanceEndPeopleButton','onclick',()=>attendanceOpenConfirm('bulk_end',attendanceBulkRows()));bind('attendanceConfirmSubmit','onclick',attendanceSubmitConfirm);


  // ---------------------------------------------------------------
  // 정기안전보건교육 월별 개인 교육일 붙여넣기
  // - 상단에서 연도와 월을 지정하고 사원명·부서·직급·해당월 표를 등록한다.
  // - 해당월 셀이 ISO 날짜이면 등록하고, 텍스트·공란은 해당 직원만 제외한다.
  // ---------------------------------------------------------------
  const regularHalfYearImportState={preview:null};
  const regularImportById=id=>document.getElementById(id);
  function regularImportNormalize(value){return String(value??'').replace(/^\ufeff/,'').replace(/\s+/g,'').trim().toLowerCase()}
  function regularImportStrictDate(value){
    const text=String(value??'').trim(),match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return null;
    const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]),check=new Date(Date.UTC(y,m-1,d));
    if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  function regularImportSplitLine(line,delimiter){return String(line).split(delimiter).map(value=>value.trim())}
  function parseRegularMonthlyText(raw,selectedMonth){
    const lines=String(raw||'').replace(/^\ufeff/,'').replace(/\r/g,'').split('\n').filter(line=>line.trim()!=='');
    if(!lines.length)throw new Error('붙여넣은 내용이 없습니다.');
    const delimiter=lines[0].includes('\t')?'\t':lines[0].includes(',')?',':null;if(!delimiter)throw new Error('엑셀 표처럼 탭으로 구분된 자료를 붙여넣으세요.');
    const headers=regularImportSplitLine(lines[0],delimiter).map(value=>regularImportNormalize(value));
    const findHeader=(...names)=>headers.findIndex(header=>names.some(name=>header===regularImportNormalize(name)));
    const nameIndex=findHeader('사원명','성명'),departmentIndex=findHeader('부서','소속'),jobIndex=findHeader('직급');
    let dateIndex=findHeader('해당월','교육일','교육일자','개별일자',`${selectedMonth}월`,String(selectedMonth));
    if(dateIndex<0&&headers.length===4)dateIndex=3;
    if(nameIndex<0||departmentIndex<0||dateIndex<0)throw new Error('헤더에 사원명, 부서, 직급, 해당월 열이 있어야 합니다.');
    const rows=[],excluded=[],seen=new Set();let total=0;
    lines.slice(1).forEach((line,lineOffset)=>{
      const cells=regularImportSplitLine(line,delimiter),lineNumber=lineOffset+2,name=cells[nameIndex]||'',department=cells[departmentIndex]||'',jobTitle=jobIndex>=0?(cells[jobIndex]||''):'',rawDate=cells[dateIndex]||'';
      if(!name&&!department&&!rawDate)return;total++;
      if(!name||!department){excluded.push({lineNumber,name,department,reason:'사원명 또는 부서가 비어 있어 제외합니다.'});return}
      const key=`${regularImportNormalize(department)}|${regularImportNormalize(name)}`;
      if(seen.has(key)){excluded.push({lineNumber,name,department,reason:'동일 사원 행이 중복되어 제외합니다.'});return}seen.add(key);
      const date=regularImportStrictDate(rawDate);
      if(!date){excluded.push({lineNumber,name,department,reason:rawDate?`해당월 제외: ${rawDate}`:'해당월 공란 제외'});return}
      rows.push({lineNumber,name,department,jobTitle,date,rawDate,key});
    });
    return {total,rows,excluded};
  }
  function regularImportLinkMonth(link){
    const titleMatch=String(link.title||'').match(/(?:^|\D)(1[0-2]|[1-9])\s*월/);if(titleMatch)return Number(titleMatch[1]);
    const date=link.first_session_date||link.conducted_date||'';return /^\d{4}-(\d{2})-/.test(date)?Number(date.slice(5,7)):0;
  }
  function regularImportLinkYear(link){return Number(link.applicable_year||String(link.first_session_date||link.conducted_date||'').slice(0,4))||0}
  function regularImportMonthLink(year,month){
    const candidates=state.educationLinks.filter(link=>Number(link.category_id)===Number(state.selectedCategoryId)&&categoryMeta(link.category_id).type==='regular'&&regularImportLinkYear(link)===Number(year)&&regularImportLinkMonth(link)===Number(month));
    return {month,candidates,link:candidates.length===1?candidates[0]:null,status:candidates.length===1?'ok':candidates.length===0?'missing':'duplicate'};
  }
  function regularImportEmployeeKey(row){return `${regularImportNormalize(row.department_name||row.department)}|${regularImportNormalize(row.employee_name||row.name)}`}
  function renderRegularImportMonthMap(item){
    const box=regularImportById('regularImportMonthMap');box.replaceChildren();const div=document.createElement('div');div.className=`regular-import-month-item ${item.status==='ok'?'ok':'error'}`;const strong=document.createElement('strong');strong.textContent=`${item.month}월 ${item.status==='ok'?'연결 완료':item.status==='missing'?'교육자료 없음':'교육자료 중복'}`;const span=document.createElement('span');span.textContent=item.link?`${item.link.title||'정기안전보건교육'} · ${formatDateDot(item.link.first_session_date||item.link.conducted_date)}`:item.candidates.length?item.candidates.map(link=>link.title||link.first_session_date).join(' / '):'해당 월의 정기교육 자료를 먼저 등록하세요.';div.append(strong,span);box.appendChild(div);
  }
  function renderRegularImportExcluded(preview){
    const box=regularImportById('regularImportExcludedList');box.replaceChildren();const combined=[...preview.parsed.excluded,...preview.unmatched];
    if(!combined.length){box.textContent='제외되거나 일치하지 않는 직원이 없습니다.';return}
    combined.slice(0,100).forEach(item=>{const row=document.createElement('div');row.className='regular-import-excluded-row';const name=document.createElement('span');name.textContent=item.name||'-';const department=document.createElement('span');department.textContent=item.department||'-';const reason=document.createElement('span');reason.textContent=item.reason||'제외';row.append(name,department,reason);box.appendChild(row)});if(combined.length>100){const more=document.createElement('div');more.textContent=`외 ${combined.length-100}명`;more.style.padding='6px 0';box.appendChild(more)}
  }
  async function buildRegularHalfYearPreview({showErrors=true}={}){
    const errorBox=regularImportById('regularImportError'),previewBox=regularImportById('regularImportPreview');errorBox.textContent='';previewBox.className='regular-import-preview';regularImportById('regularImportRunButton').disabled=true;
    try{
      const year=Number(regularImportById('regularImportYear').value),month=Number(regularImportById('regularImportMonth').value);if(!year)throw new Error('교육연도를 입력하세요.');if(month<1||month>12)throw new Error('교육월을 선택하세요.');
      const parsed=parseRegularMonthlyText(regularImportById('regularImportText').value,month),wrongYear=[];
      parsed.rows=parsed.rows.filter(row=>{if(Number(row.date.slice(0,4))===year&&Number(row.date.slice(5,7))===month)return true;wrongYear.push({...row,reason:`해당월 제외: ${row.date} (${year}년 ${month}월 자료가 아님)`});return false});parsed.excluded.push(...wrongYear);
      const employeesResult=await db.rpc('get_current_employees');if(employeesResult.error)throw new Error(friendlyErrorMessage(employeesResult.error,'직원 확인'));
      const employeeGroups=new Map();(employeesResult.data||[]).forEach(employee=>{const key=regularImportEmployeeKey(employee);if(!employeeGroups.has(key))employeeGroups.set(key,[]);employeeGroups.get(key).push(employee)});
      const importRows=[],unmatched=[];parsed.rows.forEach(row=>{const matches=employeeGroups.get(row.key)||[];if(matches.length===1)importRows.push({...row,employee:matches[0]});else unmatched.push({...row,reason:matches.length?'동일 부서에 같은 이름의 직원이 여러 명입니다.':'재직자 명부에서 이름과 부서가 일치하지 않습니다.'})});
      const monthItem=regularImportMonthLink(year,month);renderRegularImportMonthMap(monthItem);const linksReady=monthItem.status==='ok',preview={year,month,parsed,monthItem,importRows,unmatched,linksReady,cellCount:importRows.length};regularHalfYearImportState.preview=preview;
      regularImportById('regularImportTotal').textContent=parsed.total;regularImportById('regularImportEligible').textContent=importRows.length;regularImportById('regularImportExcluded').textContent=parsed.excluded.length;regularImportById('regularImportUnmatched').textContent=unmatched.length;renderRegularImportExcluded(preview);
      if(!importRows.length){previewBox.textContent='등록 가능한 날짜가 없습니다.';previewBox.classList.add('error')}else if(!linksReady){previewBox.textContent=`${year}년 ${month}월 정기교육 자료가 없거나 중복되어 등록할 수 없습니다.`;previewBox.classList.add('error')}else{previewBox.textContent=`${year}년 ${month}월 개인 교육일자 ${importRows.length}건을 등록할 수 있습니다. 텍스트·공란 ${parsed.excluded.length}명은 제외됩니다.${unmatched.length?` 직원 미일치 ${unmatched.length}명은 등록되지 않습니다.`:''}`;previewBox.classList.add('success');regularImportById('regularImportRunButton').disabled=false}
      return preview;
    }catch(error){regularHalfYearImportState.preview=null;if(showErrors)errorBox.textContent=error.message||'자료를 검증하지 못했습니다.';previewBox.textContent='붙여넣기 형식과 교육자료 연결 상태를 확인하세요.';previewBox.classList.add('error');return null}
  }
  function openRegularHalfYearImport(){
    if(!state.isAdmin||state.currentView!=='education'||categoryMeta(state.selectedCategoryId).type!=='regular'){showToast('정기안전보건교육 메뉴에서 사용할 수 있습니다.');return}
    const now=new Date();regularImportById('regularImportYear').value=now.getFullYear();regularImportById('regularImportMonth').value=now.getMonth()+1;regularHalfYearImportState.preview=null;regularImportById('regularImportText').value='';regularImportById('regularImportFile').value='';regularImportById('regularImportError').textContent='';regularImportById('regularImportPreview').textContent='연도와 월을 선택하고 표를 붙여넣은 뒤 검증하세요.';regularImportById('regularImportPreview').className='regular-import-preview';regularImportById('regularImportRunButton').disabled=true;['regularImportTotal','regularImportEligible','regularImportExcluded','regularImportUnmatched'].forEach(id=>regularImportById(id).textContent='0');regularImportById('regularImportMonthMap').replaceChildren();regularImportById('regularImportExcludedList').replaceChildren();regularImportById('regularImportExcludedDetails').open=false;openModal('regularHalfYearImportModal');requestAnimationFrame(()=>regularImportById('regularImportText').focus());
  }
  async function regularImportAssignMissing(linkId,employeeIds){let failed=0;for(let start=0;start<employeeIds.length;start+=12){const batch=employeeIds.slice(start,start+12),results=await Promise.all(batch.map(employeeId=>db.rpc('assign_employee_to_education',{p_education_link_id:Number(linkId),p_employee_id:Number(employeeId),p_target_status:'target',p_exclusion_reason:null})));results.forEach(result=>{if(result.error)failed++})}return failed}
  async function regularImportBulkSetDate(linkId,participants,date){const ids=participants.map(row=>Number(row.participant_id));let updated=0,failed=0;for(let start=0;start<ids.length;start+=200){const batchIds=ids.slice(start,start+200),result=await db.rpc('bulk_update_education_participant_dates',{p_education_link_id:Number(linkId),p_participant_ids:batchIds,p_education_date:date});if(!result.error){updated+=Array.isArray(result.data)&&result.data.length?result.data.length:batchIds.length;continue}console.warn('[정기교육 월별 일괄입력] 일괄 RPC 실패, 개별 저장으로 전환',result.error);const batchRows=participants.filter(row=>batchIds.includes(Number(row.participant_id)));const fallback=await Promise.all(batchRows.map(row=>db.rpc('update_education_participant_date',{p_education_link_id:Number(linkId),p_participant_id:Number(row.participant_id),p_education_date:date,p_expected_updated_at:row.updated_at||null})));fallback.forEach(item=>item.error?failed++:updated++)}return {updated,failed}}
  async function runRegularHalfYearImport(){
    const preview=await buildRegularHalfYearPreview();if(!preview||!preview.linksReady||!preview.cellCount)return;if(!confirm(`${preview.year}년 ${preview.month}월 개인 교육일자 ${preview.cellCount}건을 등록하시겠습니까?\n기존 날짜가 있으면 새 날짜로 변경됩니다.`))return;
    const button=regularImportById('regularImportRunButton'),previewBox=regularImportById('regularImportPreview');button.disabled=true;regularImportById('regularImportPreviewButton').disabled=true;regularImportById('regularImportText').disabled=true;regularImportById('regularImportFile').disabled=true;let updated=0,failed=0,assigned=0;
    try{
      const link=preview.monthItem.link,rows=preview.importRows;previewBox.textContent=`${preview.month}월 자료 ${rows.length}건을 처리하고 있습니다...`;
      let participantResult=await db.rpc('get_education_participants',{p_education_link_id:Number(link.id)});if(participantResult.error)throw participantResult.error;let participants=participantResult.data||[],participantByEmployee=new Map(participants.map(row=>[String(row.employee_id),row]));
      const missing=rows.filter(row=>!participantByEmployee.has(String(row.employee.employee_id))).map(row=>Number(row.employee.employee_id));if(missing.length){const assignFailed=await regularImportAssignMissing(link.id,missing);failed+=assignFailed;assigned+=Math.max(0,missing.length-assignFailed);participantResult=await db.rpc('get_education_participants',{p_education_link_id:Number(link.id)});if(participantResult.error)throw participantResult.error;participants=participantResult.data||[];participantByEmployee=new Map(participants.map(row=>[String(row.employee_id),row]))}
      const dateGroups=new Map();rows.forEach(row=>{const participant=participantByEmployee.get(String(row.employee.employee_id));if(!participant){failed++;return}if(!dateGroups.has(row.date))dateGroups.set(row.date,[]);dateGroups.get(row.date).push(participant)});
      for(const [date,dateRows] of dateGroups){const result=await regularImportBulkSetDate(link.id,dateRows,date);updated+=result.updated;failed+=result.failed}if(window.syncRegularEducationRange)await window.syncRegularEducationRange(link.id);
      previewBox.textContent=`등록 완료: ${updated}건${assigned?` · 새 대상자 연결 ${assigned}건`:''}${preview.parsed.excluded.length?` · 제외 ${preview.parsed.excluded.length}명`:''}${failed?` · 실패 ${failed}건`:''}`;previewBox.className=`regular-import-preview ${failed?'error':'success'}`;showToast(failed?'일부 자료를 저장하지 못했습니다. 결과를 확인하세요.':'월별 교육일 일괄등록을 완료했습니다.');await loadPublicData();
    }catch(error){console.error('[정기교육 월별 일괄입력]',error);regularImportById('regularImportError').textContent=friendlyErrorMessage(error,'월별 교육일 일괄등록');previewBox.textContent=`처리 중단: ${updated}건 저장됨 · ${failed}건 실패`;previewBox.className='regular-import-preview error';
    }finally{button.disabled=false;regularImportById('regularImportPreviewButton').disabled=false;regularImportById('regularImportText').disabled=false;regularImportById('regularImportFile').disabled=false}
  }
  regularImportById('regularImportFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){regularImportById('regularImportError').textContent='5MB 이하의 텍스트 파일을 사용하세요.';return}regularImportById('regularImportText').value=await file.text();await buildRegularHalfYearPreview()});
  regularImportById('regularImportText').addEventListener('paste',()=>setTimeout(()=>{regularHalfYearImportState.preview=null;regularImportById('regularImportRunButton').disabled=true},0));
  regularImportById('regularImportText').addEventListener('input',()=>{regularHalfYearImportState.preview=null;regularImportById('regularImportRunButton').disabled=true});
  ['regularImportYear','regularImportMonth'].forEach(id=>regularImportById(id).addEventListener('change',()=>{regularHalfYearImportState.preview=null;regularImportById('regularImportRunButton').disabled=true}));
  regularImportById('regularImportPreviewButton').onclick=()=>buildRegularHalfYearPreview();regularImportById('regularImportRunButton').onclick=runRegularHalfYearImport;

  bind('addEducationButton','onclick',()=>openEducationForm());
  bind('employeeForm','onsubmit',saveEmployee);bind('retireForm','onsubmit',processRetirement);bind('hardDeleteForm','onsubmit',event=>window.hardDeleteEmployee(event));
  bind('activeEmployeeTab','onclick',()=>loadEmployeeTab('active'));bind('retiredEmployeeTab','onclick',()=>loadEmployeeTab('retired'));
  bind('activeEmployeeSearch','oninput',debounce(()=>{platformPaging.active=1;state.activeEmployeeSelected.clear();renderActiveEmployees()},160));bind('activeStatusFilter','onchange',()=>{platformPaging.active=1;state.activeEmployeeSelected.clear();renderActiveEmployees()});
  bind('retiredEmployeeSearch','oninput',debounce(()=>{platformPaging.retired=1;renderRetiredEmployees()},160));bind('retiredDepartmentFilter','onchange',()=>{platformPaging.retired=1;renderRetiredEmployees()});bind('retiredSort','onchange',()=>{platformPaging.retired=1;renderRetiredEmployees()});
  bind('selectAllActiveEmployees','onchange',event=>{document.querySelectorAll('.active-row-check').forEach(x=>{x.checked=event.target.checked;x.checked?state.activeEmployeeSelected.add(String(x.value)):state.activeEmployeeSelected.delete(String(x.value))});updateActiveSelection()});
  bind('departmentSearch','oninput',debounce(renderDepartments,160));bind('addDepartmentButton','onclick',()=>openDepartmentForm());bind('departmentForm','onsubmit',saveDepartment);
  bind('educationForm','onsubmit',saveEducation);bind('educationCategory','onchange',updateEducationFormLayout);bind('assignAllButton','onclick',assignAllParticipants);bind('addSelectedParticipantsButton','onclick',addSelectedParticipants);bind('employeePickerSelectAll','onchange',event=>{window.currentEmployeePickerPageItems().forEach(x=>event.target.checked?state.employeePickerSelected.add(String(x.employee_id)):state.employeePickerSelected.delete(String(x.employee_id)));renderEmployeePicker()});bind('deleteAllParticipantsButton','onclick',deleteAllParticipants);bind('employeePickerSearch','oninput',debounce(event=>{if(event.isComposing||event.target.dataset.imeComposing==='true')return;platformPaging.employeePicker=1;renderEmployeePicker()},160));

  window.addEventListener('error',event=>console.error('[화면 실행 오류]',event.error||event.message));
  window.addEventListener('unhandledrejection',event=>console.error('[비동기 처리 오류]',event.reason));

  // Realtime refresh: one request per event burst, polling only as fallback.
  ATTENDANCE_CONFIG.fallbackRefreshMs=30000;let realtimeTimer=null;
  window.attendanceSubscribeRealtime=function(){attendanceUnsubscribeRealtime();if(!state.attendanceSessionId)return;const refresh=()=>{clearTimeout(realtimeTimer);realtimeTimer=setTimeout(()=>{if(state.currentView==='attendance'&&state.attendanceSessionId)attendanceLoadBoard({silent:true})},300)};state.attendanceChannel=db.channel(`attendance-stable-${state.attendanceSessionId}`).on('postgres_changes',{event:'*',schema:'public',table:'attendance_intervals'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'attendance_records',filter:`session_id=eq.${state.attendanceSessionId}`},refresh).on('postgres_changes',{event:'*',schema:'public',table:'attendance_sessions'},async()=>{await attendanceLoadSessions({preferredId:state.attendanceSessionId,autoSelect:true});attendanceRenderSessionInfo()}).subscribe(status=>{if(status==='SUBSCRIBED')attendanceStopPolling();else attendanceStartPolling()})};

  db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){state.isAuthenticated=false;state.isAdmin=false;state.userRole='worker';syncAdminUI()}else if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED')checkAdmin(session)});
  bind('educationListTab','onclick',()=>setEducationPanel('list'));
  bind('educationMonthlyTab','onclick',()=>setEducationPanel('monthly'));
  bind('monthlyHistorySearch','oninput',debounce(renderMonthlyEducationHistory,160));
  bind('monthlyHistoryYear','onchange',renderMonthlyEducationHistory);
  async function initializePublicLibrary(){
    let session=null;
    try{
      const result=await db.auth.getSession();
      if(!result.error)session=result.data?.session||null;
      else console.warn('[관리자 세션 확인]',result.error);
    }catch(error){console.warn('[관리자 세션 확인]',error)}
    try{
      await checkAdmin(session);
      await loadPublicData();
      showView('education');
    }catch(error){
      console.error('[초기 화면]',error);
      setStatus('educationStatus','자료를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침하세요.',true);
    }
  }
  initializePublicLibrary();
})();
