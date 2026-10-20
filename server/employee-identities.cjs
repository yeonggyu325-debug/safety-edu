'use strict';
const crypto=require('node:crypto');
function createEmployeeIdentities(db,{AppError}){
 const email=value=>{if(typeof value!=='string')throw new AppError('Company email is required');const normalized=value.trim().toLowerCase();if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw new AppError('Valid company email required');return normalized};
 const name=value=>{if(typeof value!=='string'||!value.trim()||value.trim().length>100)throw new AppError('Employee name is required (max 100 characters)');return value.trim()};
 function ensureUnique(value,exceptId=0){
  if(db.prepare('SELECT id FROM employees WHERE lower(trim(email))=? AND id<>? LIMIT 1').get(value,exceptId))throw new AppError('This company email is already registered',409,'DUPLICATE_EMAIL');
 }
 function save(p){
  const employeeName=name(p.p_employee_name),companyEmail=email(p.p_email);let id=null;
  if(p.p_employee_id!=null){id=Number(p.p_employee_id);if(!Number.isSafeInteger(id)||id<=0)throw new AppError('Invalid employee');if(!db.prepare('SELECT id FROM employees WHERE id=?').get(id))throw new AppError('Employee not found',404)}
  ensureUnique(companyEmail,id||0);
  if(id)db.prepare('UPDATE employees SET employee_name=?,email=?,updated_at=? WHERE id=?').run(employeeName,companyEmail,new Date().toISOString(),id);
  else{
   // Keep compatibility with historical education/department references; no HR fields are requested.
   db.prepare("INSERT OR IGNORE INTO employee_departments(department_name,is_active) VALUES('미지정',1)").run();
   const department=db.prepare("SELECT id FROM employee_departments WHERE department_name='미지정'").get().id;
   id=Number(db.prepare('INSERT INTO employees(employee_code,employee_name,email,department_id) VALUES(?,?,?,?)').run('EMP-'+crypto.randomUUID(),employeeName,companyEmail,department).lastInsertRowid);
  }
  return [{employee_id:id,employee_name:employeeName,email:companyEmail}];
 }
 function find(p){
  const companyEmail=email(p.p_email),rows=db.prepare('SELECT id AS employee_id,employee_name,email FROM employees WHERE lower(trim(email))=?').all(companyEmail);
  if(rows.length>1)throw new AppError('Existing duplicate company emails require correction',409,'DUPLICATE_EMAIL');
  const row=rows[0];if(!row||p.p_employee_name!=null&&row.employee_name!==name(p.p_employee_name))return [];
  return [{...row,email:companyEmail}];
 }
 function importRows(p){
  if(!Array.isArray(p.p_rows)||!p.p_rows.length||p.p_rows.length>5000)throw new AppError('CSV는 1~5,000명의 사원 데이터를 포함해야 합니다.',400,'CSV_IMPORT_INVALID');
  const seen=new Set(),pending=[];let skipped=0;
  p.p_rows.forEach((row,index)=>{
   let employeeName,companyEmail;
   try{employeeName=name(row?.employee_name);companyEmail=email(row?.email);}catch(error){throw new AppError('CSV '+(index+2)+'행: 사원명과 회사 이메일 형식을 확인하세요.',400,'CSV_IMPORT_INVALID');}
   if(seen.has(companyEmail))throw new AppError('CSV '+(index+2)+'행: 파일 안에 중복 이메일이 있습니다.',400,'CSV_IMPORT_INVALID');seen.add(companyEmail);
   const existing=db.prepare('SELECT id,employee_name FROM employees WHERE lower(trim(email))=?').all(companyEmail);
   if(existing.length>1||existing.length===1&&existing[0].employee_name!==employeeName)throw new AppError('CSV '+(index+2)+'행: 기존 사원의 이름과 이메일이 충돌합니다. 이메일: '+companyEmail,409,'CSV_IMPORT_CONFLICT');
   if(existing.length)skipped++;else pending.push({p_employee_name:employeeName,p_email:companyEmail});
  });
  pending.forEach(save);return {created_count:pending.length,skipped_count:skipped,total_count:p.p_rows.length};
 }
 return {save,find,email,ensureUnique,importRows};
}
module.exports={createEmployeeIdentities};
