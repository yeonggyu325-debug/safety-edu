'use strict';
function createEducationRecords(db,{AppError,date}){
 const fail=(message,code='VALIDATION',status=400)=>{throw new AppError(message,status,code)};
 const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
 function category(categoryId){
  const c=db.prepare('SELECT c.*,p.category_code AS parent_code,p.category_name AS parent_name FROM education_categories c LEFT JOIN education_categories p ON p.id=c.parent_id WHERE c.id=?').get(Number(categoryId));
  if(!c||!c.is_active)fail('교육 분류를 선택하세요.');
  const regular=/regular/i.test(String(c.parent_code||c.category_code))||String(c.parent_name||c.category_name).includes('정기');
  return {c,regular};
 }
 function report(value){
  if(typeof value!=='string'||!value.trim()||value.length>4096)fail('결과보고서 PDF 또는 링크를 등록하세요.','REPORT_REQUIRED');
  const url=value.trim();
  if(/^\/files\/[a-f0-9]{64}\.(pdf|xls|xlsx)$/.test(url)){
   if(!db.prepare('SELECT filename FROM stored_files WHERE filename=?').get(url.split('/').at(-1)))fail('저장된 결과보고서를 찾을 수 없습니다.');
  }else{
   let parsed;try{parsed=new URL(url)}catch{fail('결과보고서 링크를 확인하세요.')}
   if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)fail('결과보고서 링크를 확인하세요.');
  }
  return url;
 }
 function validate(record,participantCount){
  const info=category(record.category_id);report(record.result_report_url);
  if(!info.regular&&!participantCount)fail('대상자를 1명 이상 선택하세요.','PARTICIPANTS_REQUIRED');
  return info;
 }
 function save(p){
  if(!p||!p.p_record||typeof p.p_record!=='object'||Array.isArray(p.p_record))fail('교육 입력값을 확인하세요.');
  const input=p.p_record,linkId=p.p_id==null?null:Number(p.p_id);
  if(linkId!==null&&!positive(linkId))fail('교육을 찾을 수 없습니다.');
  const old=linkId?db.prepare('SELECT * FROM education_links WHERE id=?').get(linkId):null;
  if(linkId&&!old)fail('교육을 찾을 수 없습니다.','NOT_FOUND',404);
  if(old&&(!p.p_expected_updated_at||p.p_expected_updated_at!==old.updated_at))fail('다른 관리자가 수정했습니다. 교육을 다시 열어 확인하세요.','EDIT_CONFLICT',409);
  const current=old?db.prepare('SELECT * FROM education_participants WHERE education_link_id=? ORDER BY id').all(linkId):[];
  if(old){
   const actual=current.map(row=>({id:row.id,updated_at:row.updated_at}));
   if(JSON.stringify(p.p_expected_participants)!==JSON.stringify(actual))fail('대상자 정보가 변경되었습니다. 교육을 다시 열어 확인하세요.','EDIT_CONFLICT',409);
  }
  const info=category(input.category_id);
  if(!Array.isArray(p.p_employee_ids)||p.p_employee_ids.length>5000||p.p_employee_ids.some(id=>!positive(id)))fail('대상자 선택을 확인하세요.');
  const ids=[...new Set(p.p_employee_ids.map(Number))];
  if(info.regular&&ids.length)fail('정기교육에는 개인 대상자를 등록하지 않습니다.');
  for(const id of ids){
   const employee=db.prepare('SELECT id,employment_status FROM employees WHERE id=?').get(id);
   const previous=current.find(row=>row.employee_id===id);
   if(!employee||(employee.employment_status==='retired'&&(!previous||previous.target_status!=='target')))fail('선택한 사원의 근무 상태가 변경되었습니다. 다시 확인하세요.');
  }
  validate(input,ids.length);
  const first=date(input.first_session_date),second=info.regular?date(input.second_session_date):null;
  if(!first)fail('교육일을 입력하세요.');
  if(second&&second<first)fail('2차 교육일은 1차 교육일보다 빠를 수 없습니다.');
  const title=typeof input.title==='string'?input.title.trim():'';
  if(!title||title.length>500)fail('교육명을 입력하세요.');
  const topic=info.regular?String(input.education_topic||'').trim():null;
  if(topic&&topic.length>500)fail('교육 주제는 500자 이하로 입력하세요.');
  const now=new Date(Math.max(Date.now(),(Date.parse(old?.updated_at)||0)+1)).toISOString();
  const values=[Number(input.category_id),title,topic,first,second,first,report(input.result_report_url),Number(first.slice(0,4)),now];
  let id=linkId;
  if(old)db.prepare('UPDATE education_links SET category_id=?,title=?,education_topic=?,first_session_date=?,second_session_date=?,conducted_date=?,result_report_url=?,applicable_year=?,updated_at=? WHERE id=?').run(...values,id);
  else id=Number(db.prepare('INSERT INTO education_links(category_id,title,education_topic,first_session_date,second_session_date,conducted_date,result_report_url,applicable_year,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
  if(!info.regular){
   const selected=new Set(ids);
   for(const row of current)if(row.target_status==='target'&&!selected.has(row.employee_id))db.prepare('DELETE FROM education_participants WHERE id=?').run(row.id);
   const insert=db.prepare("INSERT INTO education_participants(education_link_id,employee_id,target_status,updated_at) VALUES(?,?,'target',?) ON CONFLICT(education_link_id,employee_id) DO UPDATE SET target_status='target',exclusion_reason=NULL,updated_at=excluded.updated_at WHERE education_participants.target_status<>'target'");
   for(const employeeId of ids)insert.run(id,employeeId,now);
  }
  return [db.prepare('SELECT * FROM education_links WHERE id=?').get(id)];
 }
 return {save,validate};
}
module.exports={createEducationRecords};
