'use strict';
(function personalHistoryUi(){
 const byId=id=>document.getElementById(id),dialog=byId('personalHistoryDialog'),form=byId('personalHistoryForm'),submit=byId('personalHistorySubmit');
 let request=0;
 const groups=[['hiring','채용시교육'],['special','특별교육']];
 let historyRows=[],selectedGroup=null;
 function groupOf(row){
  const code=String(row.root_category_code||row.category_code||'').toLowerCase();
  const label=String((row.parent_category_name||'')+' '+(row.category_name||'')).replace(/\s/g,'').toLowerCase();
  if(code.includes('hiring')||label.includes('채용')||label.includes('hiring'))return 'hiring';
  if(code.includes('special')||label.includes('특별')||label.includes('special'))return 'special';
  return 'regular';
 }
 function educationDay(row){return row.first_session_date||row.conducted_date||null;}
 function visibleGroups(){return groups.filter(([key])=>historyRows.some(row=>groupOf(row)===key));}
 function tabs(){
  const bar=byId('personalHistoryTabs');if(bar)bar.hidden=!visibleGroups().length;
  for(const [key,label] of groups){const button=byId('personalHistoryTab-'+key);if(!button)continue;
   const count=historyRows.filter(row=>groupOf(row)===key).length;
   button.hidden=count===0;button.textContent=label+' '+count;
   button.setAttribute('aria-selected',String(key===selectedGroup));button.tabIndex=key===selectedGroup?0:-1;
   button.classList.toggle('active',key===selectedGroup);
  }
  const panel=byId('personalHistoryPanel');if(panel){panel.hidden=!selectedGroup;if(selectedGroup)panel.setAttribute('aria-labelledby','personalHistoryTab-'+selectedGroup);else panel.removeAttribute?.('aria-labelledby');}
 }
 function render(){
  byId('personalHistoryRows').replaceChildren();tabs();
  const rows=historyRows.filter(row=>groupOf(row)===selectedGroup);
  for(const row of rows){
   const tr=document.createElement('tr');addTextCell(tr,row.category_name||'교육','history-category');
   addTextCell(tr,row.title||row.education_topic||'—','history-title');
   const date=educationDay(row);
   addTextCell(tr,date?formatDateDot(date):'—','history-date');
   byId('personalHistoryRows').appendChild(tr);
  }
  byId('personalHistoryMessage').textContent=rows.length?'':'등록된 채용시·특별교육 이력이 없습니다.';
 }
 for(const [key] of groups){
  const button=byId('personalHistoryTab-'+key);if(!button)continue;
  button.addEventListener('click',()=>{if(!visibleGroups().some(([group])=>group===key))return;selectedGroup=key;render();});
  button.addEventListener('keydown',event=>{
   const visible=visibleGroups(),index=visible.findIndex(([group])=>group===key);if(index<0)return;
   let next;if(event.key==='ArrowRight')next=(index+1)%visible.length;else if(event.key==='ArrowLeft')next=(index+visible.length-1)%visible.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=visible.length-1;else return;
   event.preventDefault();selectedGroup=visible[next][0];render();byId('personalHistoryTab-'+selectedGroup).focus();
  });
 }
 function clear(){historyRows=[];selectedGroup=null;tabs();byId('personalHistoryRows').replaceChildren();byId('personalHistoryResult').hidden=true;byId('personalHistoryMessage').textContent='';byId('personalHistoryIdentity').textContent='';byId('personalHistoryCount').textContent='0';}
 function open(employee=null){
  request++;form.reset();clear();
  byId('personalHistoryName').value=employee?.employee_name||'';
  byId('personalHistoryEmail').value=employee?.email||'';
  submit.disabled=!state.isAdmin;
  dialog.showModal();
  if(employee&&state.isAdmin)load();
 }
 async function load(event){
  event?.preventDefault();if(!state.isAdmin||!form.reportValidity())return;
  const token=++request;clear();submit.disabled=true;submit.textContent='조회 중…';
  const name=byId('personalHistoryName').value.trim(),email=byId('personalHistoryEmail').value.trim().toLowerCase();
  try{
   const identity=await db.rpc('find_employee_identity',{p_employee_name:name,p_email:email});
   if(token!==request||!state.isAdmin)return;if(identity.error)throw identity.error;
   const employee=identity.data?.[0];if(!employee){byId('personalHistoryMessage').textContent='사원명과 회사 이메일이 일치하는 사원이 없습니다.';return;}
   const history=await db.rpc('get_admin_retired_training_history',{p_employee_id:Number(employee.employee_id)});
   if(token!==request||!state.isAdmin)return;if(history.error)throw history.error;
   byId('personalHistoryIdentity').textContent=employee.employee_name+' · '+employee.email;
   historyRows=[...(history.data||[])].filter(row=>groupOf(row)!=='regular').sort((a,b)=>String(educationDay(b)||'').localeCompare(String(educationDay(a)||'')));
   selectedGroup=visibleGroups()[0]?.[0]||null;
   byId('personalHistoryCount').textContent=String(historyRows.length);byId('personalHistoryResult').hidden=false;render();
  }catch(error){if(token===request)byId('personalHistoryMessage').textContent=friendlyErrorMessage(error,'개인 교육 이력 조회');}
  finally{if(token===request){submit.disabled=!state.isAdmin;submit.textContent='이력 확인';}}
 }
 window.openPersonalHistory=open;
 window.openRetiredHistory=openRetiredHistory=employee=>open(employee);
 byId('personalHistoryButton').addEventListener('click',()=>open());
 byId('personalHistoryClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{request++;clear();submit.textContent='이력 확인';});
 form.addEventListener('submit',load);
})();
