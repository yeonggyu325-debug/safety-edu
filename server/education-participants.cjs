'use strict';
function createParticipantOperations(db,{AppError,date}){
 const id=(value,label)=>{const number=Number(value);if(!Number.isSafeInteger(number)||number<=0)throw new AppError(label+' is invalid');return number};
 const version=row=>new Date(Math.max(Date.now(),(Date.parse(row.updated_at)||0)+1)).toISOString();
 const result=row=>({...row,participant_id:row.id,individual_date_1:row.education_date,individual_date_2:row.education_date_2});
 function education(value){
  const link=db.prepare('SELECT * FROM education_links WHERE id=?').get(id(value,'Education'));
  if(!link)throw new AppError('Education not found',404);return link;
 }
 function participant(linkId,value){
  const row=db.prepare('SELECT * FROM education_participants WHERE id=? AND education_link_id=?').get(id(value,'Participant'),linkId);
  if(!row)throw new AppError('Participant does not belong to this education',404);return row;
 }
 function syncRange(linkId){
  const link=db.prepare('SELECT l.*,c.category_code,c.category_name FROM education_links l JOIN education_categories c ON c.id=l.category_id WHERE l.id=?').get(linkId);
  if(!link||!(link.category_code==='regular'||String(link.category_name).includes('정기')))return;
  const dates=db.prepare("SELECT DISTINCT education_date AS value FROM education_participants WHERE education_link_id=? AND education_date IS NOT NULL AND education_date<>'' ORDER BY education_date").all(linkId).map(row=>row.value);
  const other=dates.filter(value=>value!==link.first_session_date&&value!==link.second_session_date),effective=other.length?other:dates;
  db.prepare('UPDATE education_links SET individual_start_date=?,individual_end_date=? WHERE id=?').run(effective[0]||null,effective.at(-1)||null,linkId);
 }
 function assign(p){
  const link=education(p.p_education_link_id),employeeId=id(p.p_employee_id,'Employee');
  if(!db.prepare('SELECT id FROM employees WHERE id=?').get(employeeId))throw new AppError('Employee not found',404);
  const status=p.p_target_status||'target';if(!['target','excluded'].includes(status))throw new AppError('Invalid target status');
  const reason=status==='excluded'?String(p.p_exclusion_reason||'').trim():null;
  if(status==='excluded'&&(!reason||reason.length>500))throw new AppError('Exclusion reason is required (max 500 characters)');
  let row=db.prepare('SELECT * FROM education_participants WHERE education_link_id=? AND employee_id=?').get(link.id,employeeId);
  if(!row){
   const inserted=db.prepare('INSERT INTO education_participants(education_link_id,employee_id,target_status,exclusion_reason,updated_at) VALUES(?,?,?,?,?)').run(link.id,employeeId,status,reason,new Date().toISOString());
   row=db.prepare('SELECT * FROM education_participants WHERE id=?').get(Number(inserted.lastInsertRowid));
  }else if(row.target_status!==status||row.exclusion_reason!==reason){
   db.prepare('UPDATE education_participants SET target_status=?,exclusion_reason=?,updated_at=? WHERE id=?').run(status,reason,version(row),row.id);
   row=db.prepare('SELECT * FROM education_participants WHERE id=?').get(row.id);
  }
  return [result(row)];
 }
 function assignAll(p){
  const link=education(p.p_education_link_id),employees=db.prepare("SELECT id FROM employees WHERE employment_status<>'retired' ORDER BY id").all();let inserted=0;
  const insert=db.prepare("INSERT OR IGNORE INTO education_participants(education_link_id,employee_id,target_status,updated_at) VALUES(?,?,'target',?)");
  for(const employee of employees)inserted+=Number(insert.run(link.id,employee.id,new Date().toISOString()).changes);
  return [{inserted_count:inserted,total_current_employees:employees.length}];
 }
 function update(p,twoDates=false){
  const link=education(p.p_education_link_id),row=participant(link.id,p.p_participant_id);
  if(p.p_expected_updated_at&&p.p_expected_updated_at!==row.updated_at)throw new AppError('다른 관리자가 먼저 수정했습니다. 최신 정보를 다시 불러오세요.',409,'EDIT_CONFLICT');
  const first=date(twoDates?p.p_individual_date_1:p.p_education_date),second=twoDates?date(p.p_individual_date_2):row.education_date_2;
  if(twoDates&&!first)throw new AppError('First individual date is required');
  if(second&&(!first||second<first))throw new AppError('Second date must be on or after first date');
  db.prepare("UPDATE education_participants SET education_date=?,education_date_2=?,target_status='target',exclusion_reason=NULL,updated_at=? WHERE id=?").run(first,second,version(row),row.id);
  syncRange(link.id);return [result(db.prepare('SELECT * FROM education_participants WHERE id=?').get(row.id))];
 }
 function bulk(p){
  const link=education(p.p_education_link_id);
  if(!Array.isArray(p.p_participant_ids)||!p.p_participant_ids.length||p.p_participant_ids.length>5000)throw new AppError('Select 1 to 5000 participants');
  const ids=[...new Set(p.p_participant_ids.map(value=>id(value,'Participant')))],first=date(p.p_education_date),rows=ids.map(value=>participant(link.id,value));
  if(rows.some(row=>row.education_date_2&&(!first||row.education_date_2<first)))throw new AppError('Second date must be on or after first date');
  const stmt=db.prepare("UPDATE education_participants SET education_date=?,target_status='target',exclusion_reason=NULL,updated_at=? WHERE id=?");
  for(const row of rows)stmt.run(first,version(row),row.id);
  syncRange(link.id);return rows.map(row=>result(db.prepare('SELECT * FROM education_participants WHERE id=?').get(row.id)));
 }
 const handlers={assign_employee_to_education:assign,assign_all_current_employees:assignAll,update_education_participant_date:p=>update(p),update_education_participant_dates_v2:p=>update(p,true),bulk_update_education_participant_dates:bulk};
 return {handlers,syncRange};
}
module.exports={createParticipantOperations};
