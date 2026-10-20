'use strict';
// One-time migration only. The running application does not use Supabase.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createStore,AppError}=require('./database.cjs');
const {createBackup}=require('./backup.cjs');
const {createParticipantOperations}=require('./education-participants.cjs');
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function sourceId(value){if(!['string','number'].includes(typeof value)||!String(value).trim()||String(value).length>200)throw Error('Invalid source ID');return String(value)}
function day(value){if(value==null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Invalid source education date');return value}
function indexRows(rows,label){const index=new Map();for(const row of rows){const id=sourceId(row.id);if(index.has(id))throw Error('Duplicate source ID in '+label);index.set(id,row)}return index}
function mergeSnapshot(store,snapshot){
 for(const table of ['employees','education_participants'])if(!Array.isArray(snapshot[table]))throw Error('Missing source table: '+table);
 if(!snapshot.education_participants.length)throw Error('No source participants. Check the export or Supabase read permissions.');
 const sourceEmployees=indexRows(snapshot.employees,'employees'),sourceLinks=indexRows(snapshot.education_links||[],'education_links'),sourceCategories=indexRows(snapshot.education_categories||[],'education_categories'),sourceDepartments=indexRows(snapshot.employee_departments||[],'employee_departments');
 indexRows(snapshot.education_participants,'education_participants');
 const identities={email:new Map(),employee_code:new Map()};
 for(const id of new Set(snapshot.education_participants.map(row=>sourceId(row.employee_id)))){
  const row=sourceEmployees.get(id);if(!row)throw Error('Referenced source employee is missing: '+id);
  for(const field of ['email','employee_code']){const value=String(row[field]||'').trim().toLowerCase();if(!value)continue;const other=identities[field].get(value);if(other&&other!==id)throw Error('Duplicate source employee identity: '+field);identities[field].set(value,id)}
 }
 const db=store.db,stats={createdEmployees:0,updatedEmployees:0,createdParticipants:0,updatedParticipants:0,createdEducation:0,sourceParticipants:snapshot.education_participants.length,localOnlyPreserved:true};
 const mapped=(table,id)=>db.prepare('SELECT local_id FROM migration_sources WHERE source_key=?').get(table+':'+sourceId(id))?.local_id;
 const saveMap=(table,id,local)=>db.prepare('INSERT INTO migration_sources(source_key,local_id) VALUES(?,?) ON CONFLICT(source_key) DO UPDATE SET local_id=excluded.local_id').run(table+':'+sourceId(id),local);
 const employeeMap=new Map(),linkMap=new Map(),categoryMap=new Map(),visiting=new Set();
 function department(employee,old){
  const source=employee.department_id==null?null:sourceDepartments.get(sourceId(employee.department_id));
  const name=source?.department_name;
  if(typeof name!=='string'||!name.trim())return old?.department_id||db.prepare("SELECT id FROM employee_departments WHERE department_name='미지정'").get()?.id||Number(db.prepare("INSERT INTO employee_departments(department_name) VALUES('미지정')").run().lastInsertRowid);
  let local=db.prepare('SELECT id FROM employee_departments WHERE department_name=?').get(name.trim());
  if(!local)local={id:Number(db.prepare('INSERT INTO employee_departments(department_name,is_active) VALUES(?,?)').run(name.trim(),source.is_active===false?0:1).lastInsertRowid)};
  return local.id;
 }
 function employee(id){
  const key=sourceId(id);if(employeeMap.has(key))return employeeMap.get(key);
  const row=sourceEmployees.get(key);if(!row)throw Error('Referenced source employee is missing: '+key);
  if(typeof row.employee_name!=='string'||!row.employee_name.trim()||row.employee_name.trim().length>100)throw Error('Invalid source employee name: '+key);
  const email=row.email==null?null:String(row.email).trim().toLowerCase()||null;
  if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('Invalid source employee email: '+key);
  const candidates=new Map(),mapping=mapped('employees',key);
  if(mapping){const found=db.prepare('SELECT * FROM employees WHERE id=?').get(mapping);if(found)candidates.set(found.id,found)}
  for(const found of email?db.prepare('SELECT * FROM employees WHERE lower(trim(email))=?').all(email):[])candidates.set(found.id,found);
  if(row.employee_code)for(const found of db.prepare('SELECT * FROM employees WHERE employee_code=?').all(String(row.employee_code)))candidates.set(found.id,found);
  if(candidates.size>1)throw Error('Conflicting employee identities; resolve before sync: '+key);
  let old=[...candidates.values()][0];
  if(!old){
   const names=db.prepare('SELECT * FROM employees WHERE trim(employee_name)=?').all(row.employee_name.trim());
   const sourceNames=[...sourceEmployees.values()].filter(item=>String(item.employee_name||'').trim()===row.employee_name.trim());
   if(names.length===1&&sourceNames.length===1&&(!email||!names[0].email||String(names[0].email).trim().toLowerCase()===email))old=names[0];
   else if(names.length&&(!email||names.some(item=>!item.email)))throw Error('Ambiguous same-name employee; stable identity required: '+key);
  }
  const now=new Date().toISOString(),values={employee_name:row.employee_name.trim(),department_id:department(row,old)};
  if(row.employee_code)values.employee_code=String(row.employee_code);
  if(own(row,'email'))values.email=email;
  if(own(row,'job_title'))values.job_title=String(row.job_title||'');
  if(own(row,'employment_status')){if(!['employed','retired','leave','china_expat','non_regular','long_trip'].includes(row.employment_status))throw Error('Invalid source employment status: '+key);values.employment_status=row.employment_status}
  for(const field of ['hire_date','department_effective_date','retirement_date'])if(own(row,field))values[field]=day(row[field]);
  if(own(row,'note'))values.note=row.note==null?null:String(row.note);
  for(const field of ['created_at','updated_at'])if(row[field]){if(Number.isNaN(Date.parse(row[field])))throw Error('Invalid source timestamp: '+key);values[field]=row[field]}
  values.updated_at=values.updated_at||now;
  let local;
  if(old){
   const entries=Object.entries(values);db.prepare('UPDATE employees SET '+entries.map(([field])=>field+'=?').join(',')+' WHERE id=?').run(...entries.map(([,value])=>value),old.id);local=old.id;stats.updatedEmployees++;
  }else{
   values.employee_code=values.employee_code||'SB-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,24);
   const entries=Object.entries(values);local=Number(db.prepare('INSERT INTO employees('+entries.map(([field])=>field).join(',')+') VALUES('+entries.map(()=>'?').join(',')+')').run(...entries.map(([,value])=>value)).lastInsertRowid);stats.createdEmployees++;
  }
  saveMap('employees',key,local);employeeMap.set(key,local);return local;
 }
 function category(id){
  const key=sourceId(id);if(categoryMap.has(key))return categoryMap.get(key);
  if(visiting.has(key))throw Error('Cyclic source categories');
  const row=sourceCategories.get(key);if(!row||!row.category_code||!row.category_name)throw Error('Missing source education category: '+key);
  const existing=db.prepare('SELECT id FROM education_categories WHERE category_code=?').get(row.category_code);
  if(existing){categoryMap.set(key,existing.id);return existing.id}
  visiting.add(key);const parent=row.parent_id==null?null:category(row.parent_id);visiting.delete(key);
  const local=Number(db.prepare('INSERT INTO education_categories(category_code,category_name,parent_id,display_order,is_active) VALUES(?,?,?,?,?)').run(row.category_code,row.category_name,parent,Number(row.display_order)||0,row.is_active===false?0:1).lastInsertRowid);categoryMap.set(key,local);return local;
 }
 function education(id){
  const key=sourceId(id);if(linkMap.has(key))return linkMap.get(key);
  const mapping=mapped('education_links',key);
  if(mapping&&db.prepare('SELECT id FROM education_links WHERE id=?').get(mapping)){linkMap.set(key,mapping);return mapping}
  const row=sourceLinks.get(key);if(!row)throw Error('Education mapping or source education row is missing: '+key);
  const categoryId=category(row.category_id),title=String(row.title||''),first=day(row.first_session_date||row.conducted_date);
  let matches=db.prepare("SELECT * FROM education_links WHERE category_id=? AND title=? AND COALESCE(first_session_date,conducted_date,'')=?").all(categoryId,title,first||'');
  if(matches.length>1&&row.result_report_url)matches=matches.filter(item=>item.result_report_url===row.result_report_url);
  if(matches.length>1)throw Error('Ambiguous education mapping: '+key);
  let local=matches[0]?.id;
  if(!local){
   local=Number(db.prepare('INSERT INTO education_links(category_id,title,education_topic,first_session_date,second_session_date,conducted_date,web_url,result_report_url,is_active) VALUES(?,?,?,?,?,?,?,?,?)').run(categoryId,title,row.education_topic||null,first,day(row.second_session_date),day(row.conducted_date)||first,row.web_url||null,row.result_report_url||null,row.is_active===false?0:1).lastInsertRowid);stats.createdEducation++;
  }
  saveMap('education_links',key,local);linkMap.set(key,local);return local;
 }
 const pairs=new Set(),touched=new Set();
 for(const row of snapshot.education_participants){
  const sourceKey=sourceId(row.id),link=education(row.education_link_id),person=employee(row.employee_id),pair=link+':'+person;
  if(pairs.has(pair))throw Error('Duplicate source participation for one education/employee');pairs.add(pair);
  const mappedId=mapped('education_participants',sourceKey),mappedRow=mappedId?db.prepare('SELECT * FROM education_participants WHERE id=?').get(mappedId):null;
  const existing=db.prepare('SELECT * FROM education_participants WHERE education_link_id=? AND employee_id=?').get(link,person);
  const old=existing||mappedRow;
  const values={education_link_id:link,employee_id:person};
  for(const field of ['target_status','exclusion_reason','education_date','education_date_2','created_at','updated_at'])if(own(row,field))values[field]=row[field];
  if(!old&&!own(values,'target_status'))values.target_status='target';
  if(values.target_status&&!['target','excluded'].includes(values.target_status))throw Error('Invalid source target status');
  for(const field of ['education_date','education_date_2'])if(own(values,field))values[field]=day(values[field]);
  values.updated_at=values.updated_at||new Date().toISOString();
  if(old&&(old.education_link_id!==link||old.employee_id!==person))touched.add(old.education_link_id);
  let local;
  if(old){
   const entries=Object.entries(values);db.prepare('UPDATE education_participants SET '+entries.map(([field])=>field+'=?').join(',')+' WHERE id=?').run(...entries.map(([,value])=>value),old.id);local=old.id;stats.updatedParticipants++;
   if(mappedRow&&mappedRow.id!==old.id){db.prepare('DELETE FROM education_participants WHERE id=?').run(mappedRow.id);touched.add(mappedRow.education_link_id)}
  }else{
   const entries=Object.entries(values);local=Number(db.prepare('INSERT INTO education_participants('+entries.map(([field])=>field).join(',')+') VALUES('+entries.map(()=>'?').join(',')+')').run(...entries.map(([,value])=>value)).lastInsertRowid);stats.createdParticipants++;
  }
  saveMap('education_participants',sourceKey,local);touched.add(link);
 }
 const operations=createParticipantOperations(db,{AppError,date:day});for(const link of touched)operations.syncRange(link);
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key validation failed');
 return stats;
}
async function syncParticipants({snapshot,dataDirectory=path.resolve(process.env.SAFETY_DATA_DIR||path.join(__dirname,'../storage')),apply=false}){
 if(!fs.existsSync(path.join(dataDirectory,'database/safety-edu.sqlite')))throw Error('Existing local database is required');
 const store=createStore(dataDirectory);
 try{
  let preview;const rollback={};
  try{store.transaction(()=>{preview=mergeSnapshot(store,snapshot);throw rollback})}catch(error){if(error!==rollback)throw error}
  if(!apply)return {applied:false,...preview};
  const backup=await createBackup({dataDirectory});
  const result=store.transaction(()=>mergeSnapshot(store,snapshot));
  return {applied:true,backupDirectory:backup.directory,...result};
 }finally{store.close()}
}
function loadSnapshot(directory){
 const result={};for(const table of ['employees','education_participants','education_links','education_categories','employee_departments']){
  const file=path.join(directory,table+'.json');if(fs.existsSync(file))result[table]=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 }
 return result;
}
module.exports={mergeSnapshot,syncParticipants,loadSnapshot};

async function fetchSnapshot({url,key,fetchImpl=fetch}){
 if(!url||!key)throw Error('Set SUPABASE_URL and SUPABASE_KEY in the local environment. Never commit the key.');
 const origin=new URL(url);
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||!['','/'].includes(origin.pathname))throw Error('Use the HTTPS Supabase project URL');
 const tables=['employees','education_participants','education_links','education_categories','employee_departments'];
 const entries=await Promise.all(tables.map(async table=>{
  const rows=[];let expected=null;
  for(let offset=0;;offset+=1000){
   const endpoint=new URL('/rest/v1/'+table,origin);endpoint.searchParams.set('select','*');endpoint.searchParams.set('order','id.asc');endpoint.searchParams.set('limit','1000');endpoint.searchParams.set('offset',String(offset));
   let response;try{response=await fetchImpl(endpoint.href,{headers:{apikey:key,Authorization:'Bearer '+key,Prefer:'count=exact'},redirect:'error',signal:AbortSignal.timeout(30000)})}catch(error){throw Error('Cannot read '+table+': '+(error.cause?.code||error.message))}
   if(!response.ok)throw Error('Supabase '+table+' read failed (HTTP '+response.status+'). Check read permissions.');
   const data=await response.json();if(!Array.isArray(data)||data.length>1000)throw Error('Unexpected source response for '+table);
   const range=response.headers.get('content-range'),count=range?.match(/\/(\d+)$/);
   if(count){const total=Number(count[1]);if(expected!==null&&expected!==total)throw Error('Supabase changed during export. Retry.');expected=total}
   rows.push(...data);
   if(data.length<1000||expected!==null&&rows.length>=expected)break;
  }
  if(expected!==null&&rows.length!==expected)throw Error('Incomplete source export: '+table);
  return [table,rows];
 }));
 const snapshot=Object.fromEntries(entries);
 if(!snapshot.education_participants.length)throw Error('Supabase returned no participants. Check project state and RLS/read permissions.');
 return snapshot;
}
module.exports.fetchSnapshot=fetchSnapshot;
if(require.main===module){
 (async()=>{
  const args=process.argv.slice(2),source=args.includes('--source')?args[args.indexOf('--source')+1]:null,remote=args.includes('--remote'),apply=args.includes('--apply');
  if(Boolean(source)===remote)throw Error('Usage: node server/sync-participants.cjs (--source JSON_FOLDER | --remote) [--apply]');
  const dataDirectory=path.resolve(process.env.SAFETY_DATA_DIR||path.join(__dirname,'../storage'));
  const snapshot=source?loadSnapshot(path.resolve(source)):await fetchSnapshot({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_KEY});
  const preview=await syncParticipants({snapshot,dataDirectory,apply:false});
  let sourceDirectory=source?path.resolve(source):null;
  if(remote&&apply){
   sourceDirectory=path.join(dataDirectory,'migration','supabase-sync-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex'));fs.mkdirSync(sourceDirectory,{recursive:true});
   for(const [table,rows] of Object.entries(snapshot))fs.writeFileSync(path.join(sourceDirectory,table+'.json'),JSON.stringify(rows,null,2),{flag:'wx'});
  }
  const result=apply?await syncParticipants({snapshot,dataDirectory,apply:true}):preview;
  console.log(JSON.stringify({...result,sourceDirectory},null,2));
 })().catch(error=>{console.error(error.message);process.exitCode=1});
}
