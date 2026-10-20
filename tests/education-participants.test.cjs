'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('../server/server.cjs');
async function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safety-participants-'));let app,base,cookie='';
 async function start(){app=createApplication({dataDirectory:directory});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port}await start();
 const call=async(route,payload,anonymous=false)=>{const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:anonymous?'':cookie},body:JSON.stringify(payload)});return {status:response.status,headers:response.headers,...await response.json()}};
 const setup=await call('auth/setup',{email:'participants@example.com',password:'Participants-test-password-123'});cookie=setup.headers.get('set-cookie').split(';')[0];
 const query=p=>call('query',p),rpc=(name,params={})=>call('rpc',{name,params});
 const department=(await query({table:'employee_departments',action:'insert',payload:{department_name:'Test team'}})).data[0].id;
 const employees=[];
 for(let i=0;i<3;i++){
  const saved=await rpc('save_employee_profile_v3',{p_employee_code:'P-'+i,p_employee_name:'Person '+i,p_department_id:department,p_employment_status:i===2?'retired':'employed',p_hire_date:'2026-01-01'});
  employees.push(saved.data[0].employee_id);
 }
 const categories=(await query({table:'education_categories'})).data;
 const regular=(await query({table:'education_links',action:'insert',payload:{category_id:categories.find(x=>x.category_code==='regular').id,title:'Regular',first_session_date:'2026-10-01',second_session_date:'2026-10-02',web_url:'https://internal.example/keep.pdf',result_report_url:'https://files.example/report.pdf'}})).data[0].id;
 const special=Number(app.store.db.prepare('INSERT INTO education_links(category_id,title) VALUES(?,?)').run(categories.find(x=>x.category_code==='special').id,'Legacy special').lastInsertRowid);
 return {query,rpc,call,employees,regular,special,rows:async id=>(await rpc('get_education_participants',{p_education_link_id:id})).data,
 restart:async()=>{await app.close();await start()},close:async()=>{await app.close();const absolute=path.resolve(directory);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(absolute,{recursive:true,force:true})}};
}
test('Participant assignment is duplicate-safe, preserves exclusions in all-current registration, excludes retired employees and enforces admin access',async()=>{
 const f=await fixture();
 try{
  const params={p_education_link_id:f.regular,p_employee_id:f.employees[0]};
  assert.equal((await f.call('rpc',{name:'assign_employee_to_education',params},true)).status,401);
  const assigned=await f.rpc('assign_employee_to_education',params);assert.equal(assigned.status,200);
  const repeated=await f.rpc('assign_employee_to_education',params);assert.equal(repeated.data[0].participant_id,assigned.data[0].participant_id);
  assert.equal(repeated.data[0].updated_at,assigned.data[0].updated_at);
  assert.equal((await f.rpc('assign_employee_to_education',{...params,p_target_status:'excluded'})).status,400);
  await f.rpc('assign_employee_to_education',{...params,p_target_status:'excluded',p_exclusion_reason:'leave'});
  const all=await f.rpc('assign_all_current_employees',{p_education_link_id:f.regular});
  assert.equal(all.data[0].inserted_count,1);assert.equal(all.data[0].total_current_employees,2);
  const rows=await f.rows(f.regular);assert.equal(rows.length,2);assert.equal(rows.find(x=>x.employee_id===f.employees[0]).target_status,'excluded');
  assert.equal(rows.some(x=>x.employee_id===f.employees[2]),false);
  assert.equal((await f.rpc('assign_all_current_employees',{p_education_link_id:f.regular})).data[0].inserted_count,0);
  assert.equal((await f.rpc('assign_employee_to_education',{...params,p_employee_id:999999})).status,404);
  assert.equal((await f.rpc('assign_employee_to_education',{...params,p_education_link_id:999999})).status,404);
  await f.restart();assert.equal((await f.rows(f.regular)).length,2);
 }finally{await f.close()}
});
test('Participant dates reject stale edits and invalid dates, update education ranges atomically, and survive restart',async()=>{
 const f=await fixture();
 try{
  await f.rpc('assign_all_current_employees',{p_education_link_id:f.regular});let [one,two]=await f.rows(f.regular);
  const params={p_education_link_id:f.regular,p_participant_id:one.participant_id,p_expected_updated_at:one.updated_at,p_education_date:'2026-10-08'};
  const first=await f.rpc('update_education_participant_date',params);assert.equal(first.status,200);assert.notEqual(first.data[0].updated_at,one.updated_at);
  const stale=await f.rpc('update_education_participant_date',{...params,p_education_date:'2026-10-09'});assert.equal(stale.status,409);assert.equal(stale.error.code,'EDIT_CONFLICT');
  assert.equal((await f.rpc('update_education_participant_date',{...params,p_expected_updated_at:first.data[0].updated_at,p_education_date:'2026-02-30'})).status,400);
  await f.rpc('update_education_participant_date',{p_education_link_id:f.regular,p_participant_id:two.participant_id,p_education_date:'2026-10-10',p_expected_updated_at:two.updated_at});
  let link=(await f.query({table:'education_links',filters:[{column:'id',op:'eq',value:f.regular}]})).data[0];
  assert.equal(link.individual_start_date,'2026-10-08');assert.equal(link.individual_end_date,'2026-10-10');assert.equal(link.web_url,'https://internal.example/keep.pdf');
  const other=await f.rpc('assign_employee_to_education',{p_education_link_id:f.special,p_employee_id:f.employees[0]});
  const cross=await f.rpc('bulk_update_education_participant_dates',{p_education_link_id:f.regular,p_participant_ids:[one.participant_id,other.data[0].participant_id],p_education_date:'2026-10-20'});assert.equal(cross.status,404);
  assert.equal((await f.rows(f.regular))[0].education_date,'2026-10-08');
  const bulk=await f.rpc('bulk_update_education_participant_dates',{p_education_link_id:f.regular,p_participant_ids:[one.participant_id,two.participant_id,one.participant_id],p_education_date:'2026-10-01'});assert.equal(bulk.data.length,2);
  await f.query({table:'education_participants',action:'delete',filters:[{column:'id',op:'eq',value:one.participant_id}]});
  await f.rpc('update_education_participant_date',{p_education_link_id:f.regular,p_participant_id:two.participant_id,p_education_date:null});
  link=(await f.query({table:'education_links',filters:[{column:'id',op:'eq',value:f.regular}]})).data[0];assert.equal(link.individual_start_date,null);
  await f.restart();assert.equal((await f.rows(f.regular))[0].education_date,null);
  assert.equal((await f.query({table:'education_participants',action:'update',payload:{education_date:'not-a-date'},filters:[{column:'id',op:'eq',value:two.participant_id}]})).status,400);
 }finally{await f.close()}
});
test('Special education stores two individual dates with date order and optimistic conflict checks',async()=>{
 const f=await fixture();
 try{
  let row=(await f.rpc('assign_employee_to_education',{p_education_link_id:f.special,p_employee_id:f.employees[0],p_target_status:'excluded',p_exclusion_reason:'leave'})).data[0];
  const params={p_education_link_id:f.special,p_participant_id:row.participant_id,p_individual_date_1:'2026-10-08',p_individual_date_2:'2026-10-07',p_expected_updated_at:row.updated_at};
  assert.equal((await f.rpc('update_education_participant_dates_v2',params)).status,400);
  const saved=await f.rpc('update_education_participant_dates_v2',{...params,p_individual_date_2:'2026-10-09'});assert.equal(saved.status,200);
  row=saved.data[0];assert.equal(row.education_date,'2026-10-08');assert.equal(row.education_date_2,'2026-10-09');assert.equal(row.target_status,'target');assert.equal(row.exclusion_reason,null);
  assert.equal((await f.rpc('update_education_participant_dates_v2',{...params,p_individual_date_2:'2026-10-10'})).status,409);
  await f.restart();assert.equal((await f.rows(f.special))[0].education_date_2,'2026-10-09');
  await f.query({table:'education_participants',action:'delete',filters:[{column:'education_link_id',op:'eq',value:f.special}]});assert.equal((await f.rows(f.special)).length,0);
 }finally{await f.close()}
});
