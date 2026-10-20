'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createApplication}=require('../server/server.cjs');
test('Public participant search uses exact names, separates namesakes and returns only approved education and report fields',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-public-attendee-')),app=createApplication({dataDirectory:root});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port,db=app.store.db;
 const post=async(route,payload)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:response.status,...await response.json()}};
 try{
  const one=app.store.rpc('save_employee_identity',{p_employee_name:'Sample Name',p_email:'one@example.com'},true)[0].employee_id;
  const two=app.store.rpc('save_employee_identity',{p_employee_name:'Sample Name',p_email:'two@example.com'},true)[0].employee_id;
  const other=app.store.rpc('save_employee_identity',{p_employee_name:'Other',p_email:'other@example.com'},true)[0].employee_id;
  const categories=db.prepare('SELECT * FROM education_categories').all(),special=categories.find(c=>c.category_code==='special').id,hiring=categories.find(c=>c.category_code==='hiring').id,regular=categories.find(c=>c.category_code==='regular').id;
  const child=Number(db.prepare('INSERT INTO education_categories(category_code,category_name,parent_id) VALUES(?,?,?)').run('crane','Crane',special).lastInsertRowid);
  const regularChild=Number(db.prepare('INSERT INTO education_categories(category_code,category_name,parent_id) VALUES(?,?,?)').run('regular-child','Regular child',regular).lastInsertRowid);
  const bytes=Buffer.from('%PDF-1.4\nreport bytes\n%%EOF'),hash=crypto.createHash('sha256').update(bytes).digest('hex'),filename=hash+'.pdf',report='/files/'+filename;
  fs.writeFileSync(path.join(root,'files','education',filename),bytes);db.prepare('INSERT INTO stored_files VALUES(?,?,?,?,?)').run(filename,'report.pdf','application/pdf',bytes.length,hash);
  const insert=(employee,category,title,day,status='target',active=1)=>{
   const id=Number(db.prepare('INSERT INTO education_links(category_id,title,first_session_date,result_report_url,is_active) VALUES(?,?,?,?,?)').run(category,title,day,report,active).lastInsertRowid);
   db.prepare('INSERT INTO education_participants(education_link_id,employee_id,target_status,education_date) VALUES(?,?,?,?)').run(id,employee,status,'2026-12-31');return id;
  };
  insert(one,child,'Crane report','2026-10-02');insert(one,hiring,'Hiring report','2026-10-01');
  insert(one,regular,'Hidden regular','2026-10-03');insert(one,regularChild,'Hidden regular child','2026-10-03');
  insert(one,hiring,'Excluded','2026-10-04','excluded');insert(one,hiring,'Inactive','2026-10-05','target',0);
  insert(two,hiring,'Namesake report','2026-09-01');insert(other,hiring,'Other report','2026-09-01');
  const result=await post('/api/participants/search',{name:' Sample Name ',employee_id:other});assert.equal(result.status,200);assert.equal(result.data.matches.length,2);
  const [first,second]=result.data.matches;assert.equal(first.match,1);assert.equal(second.match,2);assert.equal(first.history.length,2);assert.equal(second.history.length,1);
  assert.equal(first.history[0].title,'Crane report');assert.equal(first.history[0].education_day,'2026-10-02');assert.equal(first.history[0].report_url,report);assert.equal(first.history[0].type,'special');
  assert.equal(second.history[0].title,'Namesake report');
  assert.deepEqual(Object.keys(first).sort(),['history','match','name']);
  assert.deepEqual(Object.keys(first.history[0]).sort(),['category','education_day','report_url','title','type']);
  assert.ok(!JSON.stringify(result.data).includes('one@example.com'));assert.ok(!JSON.stringify(result.data).includes('Hidden regular'));assert.ok(!JSON.stringify(result.data).includes('Excluded'));
  assert.equal((await fetch(base+report)).status,200);
  for(const name of ['Sam','%',"' OR 1=1 --",'Unknown'])assert.equal((await post('/api/participants/search',{name})).data.matches.length,0);
  for(const name of ['',null,42,'x'.repeat(101)])assert.equal((await post('/api/participants/search',{name})).status,400);
  assert.equal((await fetch(base+'/api/participants/search')).status,405);
  assert.equal((await post('/api/query',{table:'employees'})).status,401);
  assert.equal((await post('/api/rpc',{name:'get_education_participants',params:{p_education_link_id:1}})).status,401);
  assert.equal((await post('/api/participants/search',{name:'Sample Name'})).data.matches[0].history.length,2);
 }finally{await app.close();fs.rmSync(root,{recursive:true,force:true})}
});

test('Public department search uses current departments, deduplicates education and excludes private employee data',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-department-')),app=createApplication({dataDirectory:root});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port,db=app.store.db;
 const post=async payload=>{const r=await fetch(base+'/api/participants/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,...await r.json()}};
 try{
  const dept=name=>Number(db.prepare('INSERT INTO employee_departments(department_name) VALUES(?)').run(name).lastInsertRowid);
  const production=dept('Production One'),second=dept('Production Two'),other=dept('Other');
  const employee=(name,d)=>{const id=app.store.rpc('save_employee_identity',{p_employee_name:name,p_email:name+'@example.com'},true)[0].employee_id;db.prepare('UPDATE employees SET department_id=? WHERE id=?').run(d,id);return id};
  const a=employee('PrivateA',production),b=employee('PrivateB',production),c=employee('PrivateC',second),moved=employee('PrivateMoved',other);
  const categories=db.prepare('SELECT * FROM education_categories').all(),cat=code=>categories.find(c=>c.category_code===code).id;
  const education=(title,category,active=1)=>Number(db.prepare('INSERT INTO education_links(category_id,title,first_session_date,result_report_url,is_active) VALUES(?,?,?,?,?)').run(cat(category),title,'2026-10-01','https://reports.example/'+title+'.pdf',active).lastInsertRowid);
  const attend=(link,id,status='target')=>db.prepare('INSERT INTO education_participants(education_link_id,employee_id,target_status) VALUES(?,?,?)').run(link,id,status);
  const shared=education('Shared','special'),hiring=education('Hiring','hiring'),regular=education('Regular','regular'),excluded=education('Excluded','special'),inactive=education('Inactive','special',0),movedDoc=education('Moved','special');
  attend(shared,a);attend(shared,b);attend(shared,c);attend(hiring,b);attend(regular,a);attend(excluded,a,'excluded');attend(inactive,a);attend(movedDoc,moved);
  let result=await post({mode:'department',department:' Production '});
  assert.equal(result.status,200);assert.equal(result.data.mode,'department');assert.equal(result.data.matches.length,1);
  const rows=result.data.matches[0].history;assert.deepEqual(rows.map(r=>r.title).sort(),['Hiring','Shared']);
  assert.equal(rows.filter(r=>r.title==='Shared').length,1);
  assert.deepEqual(Object.keys(rows[0]).sort(),['category','education_day','report_url','title','type']);
  assert.ok(!JSON.stringify(result.data).includes('Private'));assert.ok(!JSON.stringify(result.data).includes('@example.com'));
  assert.equal((await post({mode:'department',department:'Production Two'})).data.matches[0].history.length,1);
  assert.equal((await post({mode:'department',department:'Other'})).data.matches[0].history[0].title,'Moved');
  db.prepare('UPDATE employees SET department_id=? WHERE id=?').run(production,moved);
  assert.equal((await post({mode:'department',department:'Other'})).data.matches.length,0);
  assert.equal((await post({mode:'department',department:'Production'})).data.matches[0].history.length,3);
  for(const department of ['%',"_","' OR 1=1 --",'Unknown'])assert.equal((await post({mode:'department',department})).data.matches.length,0);
  for(const department of ['',null,42,'x'.repeat(101)])assert.equal((await post({mode:'department',department})).status,400);
  assert.equal((await post({mode:'invalid',name:'PrivateA'})).status,400);
  assert.equal((await post({name:'PrivateA'})).data.matches[0].history.length,1);
  const privateResponse=await fetch(base+'/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:'employees'})});assert.equal(privateResponse.status,401);
 }finally{await app.close();fs.rmSync(root,{recursive:true,force:true})}
});
