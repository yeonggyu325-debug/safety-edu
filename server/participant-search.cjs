'use strict';
function createParticipantSearch(db,{AppError}){
 const match=db.prepare('SELECT id,employee_name FROM employees WHERE trim(employee_name)=? ORDER BY id');
 const history=db.prepare("SELECT l.title,l.education_topic,l.first_session_date,l.conducted_date,l.result_report_url,c.category_name,c.category_code,parent.category_name AS parent_name,parent.category_code AS parent_code FROM education_participants p JOIN education_links l ON l.id=p.education_link_id JOIN education_categories c ON c.id=l.category_id LEFT JOIN education_categories parent ON parent.id=c.parent_id WHERE p.employee_id=? AND p.target_status='target' AND COALESCE(l.is_active,1)=1 AND c.is_active=1 AND COALESCE(parent.is_active,1)=1 ORDER BY COALESCE(l.first_session_date,l.conducted_date,'') DESC,l.id DESC");
 const departmentHistory=db.prepare("SELECT DISTINCT l.id,l.title,l.education_topic,l.first_session_date,l.conducted_date,l.result_report_url,c.category_name,c.category_code,parent.category_name AS parent_name,parent.category_code AS parent_code FROM education_participants p JOIN employees e ON e.id=p.employee_id JOIN employee_departments d ON d.id=e.department_id JOIN education_links l ON l.id=p.education_link_id JOIN education_categories c ON c.id=l.category_id LEFT JOIN education_categories parent ON parent.id=c.parent_id WHERE instr(lower(trim(d.department_name)),lower(?))>0 AND d.is_active=1 AND p.target_status='target' AND COALESCE(l.is_active,1)=1 AND c.is_active=1 AND COALESCE(parent.is_active,1)=1 ORDER BY COALESCE(l.first_session_date,l.conducted_date,'') DESC,l.id DESC");
 function group(row){
  const code=String(row.parent_code||row.category_code||'').toLowerCase();
  const label=String(row.parent_name||row.category_name||'').replace(/\s/g,'');
  if(code.includes('regular')||label.includes('정기'))return null;
  if(code.includes('hiring')||label.includes('채용'))return 'hiring';
  if(code.includes('special')||label.includes('특별'))return 'special';
  return null;
 }
 function publicHistory(rows){return rows.flatMap(row=>{
  const type=group(row);if(!type)return [];
  return [{type,category:row.category_name,title:row.title||row.education_topic||row.category_name,education_day:row.first_session_date||row.conducted_date||null,report_url:row.result_report_url||null}];
 })}
 return function search(payload){
  if(payload.mode!=null&&!['name','department'].includes(payload.mode))throw new AppError('검색 구분을 확인하세요.');
  if(payload.mode==='department'){
   if(typeof payload.department!=='string'||!payload.department.trim()||payload.department.trim().length>100)throw new AppError('부서명을 입력하세요. (100자 이하)');
   const name=payload.department.trim(),rows=publicHistory(departmentHistory.all(name));
   return {mode:'department',matches:rows.length?[{name,match:1,history:rows}]:[]};
  }
  if(typeof payload.name!=='string'||!payload.name.trim()||payload.name.trim().length>100)throw new AppError('참석자 이름을 입력하세요. (100자 이하)');
  return {matches:match.all(payload.name.trim()).map((employee,index)=>({
   name:employee.employee_name,match:index+1,
   history:publicHistory(history.all(employee.id))
  }))};
 };
}
module.exports={createParticipantSearch};
