
'use strict';
const {DatabaseSync}=require('node:sqlite');
const {createParticipantOperations}=require('./education-participants.cjs');
const {createEducationRecords}=require('./education-records.cjs');
const {createEmployeeIdentities}=require('./employee-identities.cjs');
const fs=require('node:fs'),path=require('node:path');
class AppError extends Error{constructor(message,status=400,code='VALIDATION'){super(message);this.status=status;this.code=code}}
const text=(v,label)=>{if(typeof v!=='string'||!v.trim()||v.length>500)throw new AppError(label+' is required (max 500 characters)');return v.trim()};
const date=v=>{if(v==null||v==='')return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw new AppError('Invalid date');return v};
const statuses=new Set(['employed','retired','leave','china_expat','non_regular','long_trip']);
function createStore(directory){
 for(const folder of ['database','files/education','files/reports','backups'])fs.mkdirSync(path.join(directory,folder),{recursive:true});
 const db=new DatabaseSync(path.join(directory,'database','safety-edu.sqlite'));
 db.exec([
 'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;',
 'CREATE TABLE IF NOT EXISTS admin_users(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,salt TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS auth_login_failures(account_key TEXT PRIMARY KEY,failed_count INTEGER NOT NULL,last_failed_at INTEGER NOT NULL,locked_until INTEGER NOT NULL DEFAULT 0);',
 'CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);',
 'CREATE TABLE IF NOT EXISTS employee_departments(id INTEGER PRIMARY KEY,department_name TEXT NOT NULL UNIQUE,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)));',
 "CREATE TABLE IF NOT EXISTS employees(id INTEGER PRIMARY KEY,employee_code TEXT NOT NULL UNIQUE,employee_name TEXT NOT NULL,department_id INTEGER NOT NULL REFERENCES employee_departments(id),job_title TEXT NOT NULL DEFAULT '',email TEXT,employment_status TEXT NOT NULL DEFAULT 'employed',hire_date TEXT,department_effective_date TEXT,retirement_date TEXT,note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
 'CREATE TABLE IF NOT EXISTS employee_department_history(id INTEGER PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,previous_department_id INTEGER REFERENCES employee_departments(id),new_department_id INTEGER NOT NULL REFERENCES employee_departments(id),effective_from TEXT NOT NULL,effective_to TEXT,note TEXT);',
 'CREATE TABLE IF NOT EXISTS employee_monthly_status_history(id INTEGER PRIMARY KEY,employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,status TEXT NOT NULL,effective_from TEXT NOT NULL,effective_to TEXT,note TEXT,UNIQUE(employee_id,effective_from));',
 'CREATE TABLE IF NOT EXISTS education_categories(id INTEGER PRIMARY KEY,category_code TEXT NOT NULL UNIQUE,category_name TEXT NOT NULL,parent_id INTEGER REFERENCES education_categories(id),display_order INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1);',
 "CREATE TABLE IF NOT EXISTS education_links(id INTEGER PRIMARY KEY,category_id INTEGER NOT NULL REFERENCES education_categories(id),title TEXT NOT NULL DEFAULT '',education_topic TEXT,first_session_date TEXT,second_session_date TEXT,conducted_date TEXT,individual_start_date TEXT,individual_end_date TEXT,web_url TEXT,result_report_url TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
 "CREATE TABLE IF NOT EXISTS education_participants(id INTEGER PRIMARY KEY,education_link_id INTEGER NOT NULL REFERENCES education_links(id) ON DELETE CASCADE,employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,target_status TEXT NOT NULL DEFAULT 'target',exclusion_reason TEXT,education_date TEXT,education_date_2 TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(education_link_id,employee_id));",

  'CREATE TABLE IF NOT EXISTS stored_files(filename TEXT PRIMARY KEY,original_name TEXT NOT NULL,content_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL);',
  'CREATE TABLE IF NOT EXISTS migration_sources(source_key TEXT PRIMARY KEY,local_id INTEGER NOT NULL);',
 ].join('\n'));
 const sessionColumns=new Set(db.prepare('PRAGMA table_info(sessions)').all().map(x=>x.name));
 if(!sessionColumns.has('last_activity')){db.exec('ALTER TABLE sessions ADD COLUMN last_activity INTEGER NOT NULL DEFAULT 0');db.prepare('DELETE FROM sessions WHERE last_activity=0').run();}
 const existingLinkColumns=new Set(db.prepare('PRAGMA table_info(education_links)').all().map(x=>x.name));
 for(const [column,type] of Object.entries({description:'TEXT',applicable_year:'INTEGER',applicable_period:'TEXT',display_order:'INTEGER',is_active:'INTEGER',participant_count:'INTEGER',education_hours:'REAL'}))if(!existingLinkColumns.has(column))db.exec('ALTER TABLE education_links ADD COLUMN '+column+' '+type);
 const identities=createEmployeeIdentities(db,{AppError});
 const participants=createParticipantOperations(db,{AppError,date});
 const records=createEducationRecords(db,{AppError,date});
 const tables=['employee_departments','employees','employee_monthly_status_history','education_categories','education_links','education_participants'];
 const columns=Object.fromEntries(tables.map(t=>[t,new Set(db.prepare('PRAGMA table_info('+t+')').all().map(x=>x.name))]));
 const boolRows=rows=>rows.map(row=>{const result={...row};if('is_active'in result)result.is_active=Boolean(result.is_active);return result});
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value}catch(error){db.exec('ROLLBACK');throw error}}
 if(!db.prepare('SELECT id FROM education_categories LIMIT 1').get()){
  const insert=db.prepare('INSERT INTO education_categories(category_code,category_name,parent_id,display_order) VALUES(?,?,?,?)');
  transaction(()=>{insert.run('regular','정기안전보건교육',null,1);insert.run('special','특별안전교육',null,2);insert.run('hiring','채용시 교육',null,3);});
 }
 const rosterSql='SELECT e.*,e.id AS employee_id,d.department_name FROM employees e JOIN employee_departments d ON d.id=e.department_id';
 function roster(retired=false){return db.prepare(rosterSql+' WHERE '+(retired?"e.employment_status='retired'":"e.employment_status<>'retired'")+' ORDER BY d.department_name,e.employee_name,e.id').all()}
 function saveProfile(p){
  const status=p.p_employment_status||'employed';if(!statuses.has(status))throw new AppError('Invalid employment status');
  const department=Number(p.p_department_id);if(!db.prepare('SELECT id FROM employee_departments WHERE id=? AND is_active=1').get(department))throw new AppError('Select an active department');
  const values=[text(p.p_employee_code,'Employee code'),text(p.p_employee_name,'Employee name'),department,String(p.p_job_title||''),status,date(p.p_hire_date),date(p.p_department_effective_date),p.p_note||null];
  let id=p.p_employee_id?Number(p.p_employee_id):null;
  const old=id?db.prepare('SELECT * FROM employees WHERE id=?').get(id):null;
  if(id&&!old)throw new AppError('Employee not found',404);
  if(id)db.prepare('UPDATE employees SET employee_code=?,employee_name=?,department_id=?,job_title=?,employment_status=?,hire_date=?,department_effective_date=?,note=?,updated_at=? WHERE id=?').run(...values,new Date().toISOString(),id);
  else id=Number(db.prepare('INSERT INTO employees(employee_code,employee_name,department_id,job_title,employment_status,hire_date,department_effective_date,note) VALUES(?,?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
  if(!old||Number(old.department_id)!==department){
   const effective=values[6]||values[5]||new Date().toISOString().slice(0,10);
   db.prepare('UPDATE employee_department_history SET effective_to=? WHERE employee_id=? AND effective_to IS NULL').run(effective,id);
   db.prepare('INSERT INTO employee_department_history(employee_id,previous_department_id,new_department_id,effective_from,note) VALUES(?,?,?,?,?)').run(id,old?.department_id??null,department,effective,values[7]);
  }
  return id;
 }
 function statusHistory(p){
  const id=Number(p.p_employee_id),from=date(p.p_effective_from);if(!from||!statuses.has(p.p_status))throw new AppError('Invalid status history');
  db.prepare('INSERT INTO employee_monthly_status_history(employee_id,status,effective_from,note) VALUES(?,?,?,?) ON CONFLICT(employee_id,effective_from) DO UPDATE SET status=excluded.status,note=excluded.note').run(id,p.p_status,from,p.p_note||null);
  const periods=db.prepare('SELECT id,effective_from FROM employee_monthly_status_history WHERE employee_id=? ORDER BY effective_from').all(id);
  const update=db.prepare('UPDATE employee_monthly_status_history SET effective_to=? WHERE id=?');
  periods.forEach((row,i)=>update.run(periods[i+1]?new Date(Date.parse(periods[i+1].effective_from+'T00:00:00Z')-86400000).toISOString().slice(0,10):null,row.id));return true;
 }
 function rpc(name,p,admin){
  if(name==='is_admin')return admin;
  if(!admin)throw new AppError('Administrator login required',401,'AUTH_REQUIRED');
  if(Object.hasOwn(participants.handlers,name))return participants.handlers[name](p);
  switch(name){
   case 'save_education_report':return records.save(p);
   case 'save_employee_identity':return identities.save(p);
   case 'find_employee_identity':return identities.find(p);
   case 'import_employee_identities_csv':return identities.importRows(p);
   case 'get_current_employees':return roster();
   case 'get_admin_employee_roster':return roster(p.p_roster==='retired');
   case 'get_department_employee_counts':return db.prepare("SELECT d.id AS department_id,COUNT(e.id) AS employee_count FROM employee_departments d LEFT JOIN employees e ON e.department_id=d.id AND e.employment_status<>'retired' GROUP BY d.id").all();
   case 'get_department_change_history':return db.prepare("SELECT h.*,e.employee_name,a.department_name AS previous_department_name,b.department_name AS new_department_name,CASE WHEN h.previous_department_id IS NULL THEN '입사' ELSE '전배' END AS change_type FROM employee_department_history h JOIN employees e ON e.id=h.employee_id LEFT JOIN employee_departments a ON a.id=h.previous_department_id JOIN employee_departments b ON b.id=h.new_department_id WHERE h.previous_department_id=? OR h.new_department_id=? ORDER BY h.effective_from DESC,h.id DESC").all(Number(p.p_department_id),Number(p.p_department_id));
   case 'save_employee_profile_v3':return [{employee_id:saveProfile(p)}];
   case 'upsert_employee_monthly_status':return statusHistory(p);
   case 'retire_employee':{
    const id=Number(p.p_employee_id),retirement=date(p.p_retirement_date);if(!retirement)throw new AppError('Retirement date is required');
    const result=db.prepare("UPDATE employees SET employment_status='retired',retirement_date=?,note=COALESCE(?,note),updated_at=? WHERE id=?").run(retirement,p.p_note||null,new Date().toISOString(),id);
    if(!result.changes)throw new AppError('Employee not found',404);
    statusHistory({p_employee_id:id,p_status:'retired',p_effective_from:retirement,p_note:p.p_note});return true;
   }
   case 'hard_delete_employee':
   case 'hard_delete_employees':{
    const ids=name==='hard_delete_employee'?[p.p_employee_id]:p.p_employee_ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>5000)throw new AppError('Invalid employee selection');
    const del=db.prepare("DELETE FROM employees WHERE id=? AND employment_status='retired'");let deleted=0;
    for(const id of ids){const employee=db.prepare('SELECT employment_status FROM employees WHERE id=?').get(Number(id));if(employee&&employee.employment_status!=='retired')throw new AppError('Only retired employees may be permanently deleted');deleted+=Number(del.run(Number(id)).changes);}
    return [{deleted_count:deleted}];
   }
   case 'bulk_import_active_employees_v3':{
    if(!Array.isArray(p.p_rows)||p.p_rows.length>5000)throw new AppError('Maximum 5000 rows');
    let success=0,failed=0;
    for(const row of p.p_rows){db.exec('SAVEPOINT import_row');try{
     const departmentName=text(row.department_name,'Department');let dep=db.prepare('SELECT id FROM employee_departments WHERE department_name=?').get(departmentName);
     if(!dep)dep={id:Number(db.prepare('INSERT INTO employee_departments(department_name) VALUES(?)').run(departmentName).lastInsertRowid)};
     const args=Object.fromEntries(Object.entries(row).map(([key,value])=>['p_'+key,value]));args.p_department_id=dep.id;saveProfile(args);
     db.exec('RELEASE import_row');success++;
    }catch{db.exec('ROLLBACK TO import_row; RELEASE import_row');failed++;}}
    return [{success_count:success,failed_count:failed}];
   }
   case 'get_education_participants':return db.prepare('SELECT p.*,p.id AS participant_id,e.employee_code,e.employee_name,e.email,e.job_title,e.employment_status,e.hire_date,e.retirement_date,e.department_id,d.department_name FROM education_participants p JOIN employees e ON e.id=p.employee_id JOIN employee_departments d ON d.id=e.department_id WHERE p.education_link_id=? ORDER BY d.department_name,e.employee_name').all(Number(p.p_education_link_id));
   case 'get_admin_retired_training_history':return db.prepare('SELECT p.*,l.*,c.category_name,c.category_code,COALESCE(parent.category_code,c.category_code) AS root_category_code,parent.category_name AS parent_category_name FROM education_participants p JOIN education_links l ON l.id=p.education_link_id JOIN education_categories c ON c.id=l.category_id LEFT JOIN education_categories parent ON parent.id=c.parent_id WHERE p.employee_id=? ORDER BY l.first_session_date DESC').all(Number(p.p_employee_id));
   default:throw new AppError('This feature is not yet connected to local storage: '+name,501,'NOT_IMPLEMENTED');
  }
 }
 function query(q,admin){
  const table=q.table;if(!tables.includes(table))throw new AppError('Unsupported table',400,'NOT_IMPLEMENTED');
  const action=q.action||'select';if(!['select','insert','update','delete'].includes(action))throw new AppError('Unsupported operation');
  const publicRead=action==='select'&&['education_categories','education_links'].includes(table);
  if(!admin&&!publicRead)throw new AppError('Administrator login required',401,'AUTH_REQUIRED');
  const column=c=>{if(!columns[table].has(c))throw new AppError('Unknown field: '+c);return '"'+c+'"'};
  const bindings=[],clauses=[];
  function clause(f){
   const c=column(f.column),op=f.op;
   if(op==='in'){if(!Array.isArray(f.value)||f.value.length>5000)throw new AppError('Invalid filter');if(!f.value.length)return '0=1';bindings.push(...f.value.map(v=>typeof v==='boolean'?Number(v):v));return c+' IN ('+f.value.map(()=>'?').join(',')+')'}
   if(op==='is'&&f.value===null)return c+' IS NULL';
   const operators={eq:'=',neq:'<>',lte:'<=',gte:'>='};if(!operators[op])throw new AppError('Unsupported filter');
   bindings.push(typeof f.value==='boolean'?Number(f.value):f.value);return c+operators[op]+'?';
  }
  if(!Array.isArray(q.filters||[])||(q.filters||[]).length>25)throw new AppError('Invalid filters');
  for(const f of q.filters||[])clauses.push(clause(f));
  if(q.or){clauses.push('('+q.or.split(',').map(part=>{const match=/^(\w+)\.(is|gte|lte|eq)\.(.*)$/.exec(part);if(!match)throw new AppError('Invalid OR filter');return clause({column:match[1],op:match[2],value:match[3]==='null'?null:match[3]})}).join(' OR ')+')');}
  const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
  if(action==='select'){
   const selected=!q.columns||q.columns==='*'?'*':q.columns.split(',').map(column).join(',');
   const order=(q.orders||[]).map(o=>column(o.column)+(o.ascending===false?' DESC':' ASC')).join(',');
   const limit=Math.min(Number(q.limit??50000),50000),offset=Number(q.offset||0);
   if(!Number.isInteger(limit)||limit<0||!Number.isInteger(offset)||offset<0)throw new AppError('Invalid range');
   return boolRows(db.prepare('SELECT '+selected+' FROM '+table+where+(order?' ORDER BY '+order:'')+' LIMIT ? OFFSET ?').all(...bindings,limit,offset));
  }
  if(['update','delete'].includes(action)&&!clauses.length)throw new AppError('A filter is required for changes');
  if(action==='delete'&&table==='employees')throw new AppError('Use retirement deletion API');
  if(action==='delete'){const removed=db.prepare('DELETE FROM '+table+where+' RETURNING *').all(...bindings);if(table==='education_participants')for(const linkId of new Set(removed.map(row=>row.education_link_id)))participants.syncRange(linkId);return boolRows(removed);}
  if(table==='education_participants')throw new AppError('Use participant registration and date APIs');
  const rows=Array.isArray(q.payload)?q.payload:[q.payload];if(!rows.length||rows.length>5000)throw new AppError('Invalid rows');
  const result=[];
  for(const item of rows){
   if(!item||typeof item!=='object')throw new AppError('Invalid row');
   const payload={...item};delete payload.created_at;if(action==='update')delete payload.id;
   if(table==='employee_departments'&&'department_name'in payload)payload.department_name=text(payload.department_name,'Department');
   if(table==='employees'){
    const permitted=action==='update'?['email','retirement_date','updated_at']:[];
    if(Object.keys(payload).some(k=>!permitted.includes(k)))throw new AppError('Use employee profile API');
    if('email'in payload&&payload.email){payload.email=identities.email(payload.email);const matches=db.prepare('SELECT id FROM employees'+where).all(...bindings);if(matches.length!==1)throw new AppError('Update one employee email at a time');identities.ensureUnique(payload.email,matches[0].id);}
    if('retirement_date'in payload)payload.retirement_date=date(payload.retirement_date);
    if(payload.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))throw new AppError('Invalid email');
   }
   const entries=Object.entries(payload);if(!entries.length)throw new AppError('Empty row');
   if(table==='education_links'){const existing=action==='update'?db.prepare('SELECT * FROM education_links'+where).all(...bindings):[{}];for(const row of existing){const merged={...row,...payload};const targets=row.id?db.prepare("SELECT COUNT(*) AS n FROM education_participants WHERE education_link_id=? AND target_status='target'").get(row.id).n:0;records.validate(merged,targets);}}
   const names=entries.map(([key])=>column(key)),values=entries.map(([,value])=>typeof value==='boolean'?Number(value):value??null);
   const sql=action==='insert'?'INSERT INTO '+table+' ('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+') RETURNING *':'UPDATE '+table+' SET '+names.map(c=>c+'=?').join(',')+where+' RETURNING *';
   result.push(...db.prepare(sql).all(...values,...(action==='update'?bindings:[])));
  }return boolRows(result);
 }
 return {db,rpc,query,transaction,close:()=>db.close()};
}
module.exports={createStore,AppError};
