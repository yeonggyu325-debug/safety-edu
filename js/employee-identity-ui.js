'use strict';
(function employeeIdentityUi(){
 const byId=id=>document.getElementById(id),pages={active:1,retired:1},pageSize=25;
 function selection(){
  const checks=[...document.querySelectorAll('#retiredEmployeeTableBody .retired-row-check')],count=state.retiredEmployeeSelected.size;
  byId('retiredSelectionText').textContent='선택 '+count+'명';byId('retiredBulkDeleteButton').disabled=!count;
  const all=byId('retiredSelectAll');if(all){all.checked=checks.length>0&&checks.every(x=>x.checked);all.indeterminate=checks.some(x=>x.checked)&&!checks.every(x=>x.checked)}
 }
 function header(key){
  const panel=byId(key==='active'?'activeEmployeePanel':'retiredEmployeePanel'),table=panel.querySelector('table'),head=table.querySelector('thead tr'),group=table.querySelector('colgroup');
  const checkbox=byId(key==='active'?'selectAllActiveEmployees':'retiredSelectAll');
  if(key==='active'&&checkbox){let holder=byId('legacyEmployeeSelection');if(!holder){holder=document.createElement('span');holder.id='legacyEmployeeSelection';holder.hidden=true;panel.appendChild(holder)}holder.appendChild(checkbox)}
  head.replaceChildren();group?.replaceChildren();
  if(key==='retired'){const th=document.createElement('th');th.scope='col';if(checkbox)th.appendChild(checkbox);head.appendChild(th)}
  for(const label of ['No.','사원명','회사 이메일','관리']){const th=document.createElement('th');th.scope='col';th.textContent=label;head.appendChild(th)}
  if(group)for(let i=0;i<(key==='active'?4:5);i++)group.appendChild(document.createElement('col'));
 }
 function render(key){
  header(key);const isActive=key==='active',search=byId(isActive?'activeEmployeeSearch':'retiredEmployeeSearch');
  const tokens=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows=(isActive?state.activeEmployees:state.retiredEmployees).filter(row=>tokens.every(token=>(row.employee_name+' '+(row.email||'')).toLowerCase().includes(token))).sort((a,b)=>String(a.employee_name).localeCompare(String(b.employee_name),'ko')||String(a.email||'').localeCompare(String(b.email||'')));
  const body=byId(isActive?'activeEmployeeTableBody':'retiredEmployeeTableBody'),statusId=isActive?'activeEmployeeStatus':'retiredEmployeeStatus';
  body.replaceChildren();setStatus(statusId,rows.length?'':tokens.length?'일치하는 사원이 없습니다.':'등록된 사원이 없습니다.');
  const count=Math.max(1,Math.ceil(rows.length/pageSize));pages[key]=Math.min(Math.max(1,pages[key]),count);const offset=(pages[key]-1)*pageSize;
  for(const [index,row] of rows.slice(offset,offset+pageSize).entries()){
   const tr=document.createElement('tr');
   if(!isActive){const td=document.createElement('td'),check=document.createElement('input');check.type='checkbox';check.className='retired-row-check';check.checked=state.retiredEmployeeSelected.has(String(row.employee_id));check.value=row.employee_id;check.setAttribute('aria-label',row.employee_name+' 선택');check.onchange=()=>{check.checked?state.retiredEmployeeSelected.add(String(row.employee_id)):state.retiredEmployeeSelected.delete(String(row.employee_id));selection()};td.appendChild(check);tr.appendChild(td)}
   addTextCell(tr,offset+index+1,'identity-number');addTextCell(tr,row.employee_name,'identity-name');addTextCell(tr,row.email||'미등록','identity-email');
   const td=document.createElement('td');td.className='identity-actions';
   for(const [label,handler] of [['수정',()=>openEmployeeForm(row)],['교육이력',()=>openRetiredHistory(row)]]){const button=document.createElement('button');button.type='button';button.className='mini';button.textContent=label;button.onclick=handler;td.appendChild(button)}
   tr.appendChild(td);body.appendChild(tr);
  }
  const pager=byId(isActive?'activeEmployeePagination':'retiredEmployeePagination');if(pager){pager.replaceChildren();pager.hidden=rows.length<=pageSize;if(rows.length>pageSize){const text=document.createElement('span');text.textContent='총 '+rows.length+'명 · '+pages[key]+'/'+count+'페이지';pager.appendChild(text);for(const [label,next] of [['이전',pages[key]-1],['다음',pages[key]+1]]){const button=document.createElement('button');button.type='button';button.className='platform-page-button';button.textContent=label;button.disabled=next<1||next>count;button.onclick=()=>{pages[key]=next;render(key)};pager.appendChild(button)}}}
  if(!isActive)selection();
 }
 window.renderActiveEmployees=renderActiveEmployees=()=>render('active');
 window.renderRetiredEmployees=renderRetiredEmployees=()=>{};
 for(const [key,id] of [['active','activeEmployeeSearch'],['retired','retiredEmployeeSearch']]){const input=byId(id);if(!input)continue;input.placeholder='사원명 또는 회사 이메일 검색';input.setAttribute('aria-label','사원명 또는 회사 이메일 검색');input.addEventListener('input',()=>{pages[key]=1;render(key)})}
 const previous=window.showView||showView;
 window.showView=showView=function(name){const result=previous(name);if(name==='employees')byId('pageTitle').textContent='사원 관리';return result};
})();
