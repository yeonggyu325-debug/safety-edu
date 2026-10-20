'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStore}=require('../server/database.cjs'),{syncParticipants,fetchSnapshot}=require('../server/sync-participants.cjs'),{verifyBackup}=require('../server/backup.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-sync-test-')),store=createStore(root),db=store.db;
 const employee=store.rpc('save_employee_identity',{p_employee_name:'Local Name',p_email:'same@example.com'},true)[0].employee_id;
 const categories=db.prepare('SELECT * FROM education_categories').all(),special=categories.find(c=>c.category_code==='special').id,hiring=categories.find(c=>c.category_code==='hiring').id;
 const link=Number(db.prepare('INSERT INTO education_links(category_id,title,first_session_date,result_report_url) VALUES(?,?,?,?)').run(special,'Keep local title','2026-10-01','https://files.example/local-report.pdf').lastInsertRowid);
 const only=Number(db.prepare('INSERT INTO education_links(category_id,title,first_session_date) VALUES(?,?,?)').run(hiring,'Local only','2026-09-01').lastInsertRowid);
 db.prepare('INSERT INTO migration_sources VALUES(?,?)').run('education_links:99',link);
 db.prepare("INSERT INTO education_participants(education_link_id,employee_id,education_date,updated_at) VALUES(?,?,?,?)").run(link,employee,'2026-10-20','2026-10-20T00:00:00.000Z');
 db.prepare("INSERT INTO education_participants(education_link_id,employee_id,education_date) VALUES(?,?,?)").run(only,employee,'2026-09-01');
 const snapshot={
 employees:[{id:10,employee_code:'REMOTE-10',employee_name:'Source Name',email:'same@example.com',updated_at:'2025-01-01T00:00:00.000Z'},{id:11,employee_code:'REMOTE-11',employee_name:'New Person',email:'new@example.com'}],
 education_categories:[{id:90,category_code:'special',category_name:'Special'},{id:91,category_code:'hiring',category_name:'Hiring'}],
 education_links:[{id:99,category_id:90,title:'Remote title',first_session_date:'2026-10-01',result_report_url:'https://files.example/source-report.pdf'},{id:100,category_id:91,title:'New source education',first_session_date:'2026-10-02'}],
 education_participants:[{id:501,education_link_id:99,employee_id:10,target_status:'target',education_date:'2025-01-01',education_date_2:null,updated_at:'2025-01-01T00:00:00.000Z'},{id:502,education_link_id:100,employee_id:11,target_status:'target',education_date:null,education_date_2:null,updated_at:'2025-01-01T00:00:00.000Z'}]
 };
 return {root,store,db,employee,link,only,snapshot,close(){store.close();fs.rmSync(root,{recursive:true,force:true})}};
}
const contents=db=>JSON.stringify(['employees','education_links','education_participants','migration_sources'].map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY '+(table==='migration_sources'?'source_key':'id')).all()));
test('Sync preview is read-only; Supabase wins older conflicts; identities and education mappings stay stable; backup and replay preserve local-only records',async()=>{
 const f=fixture();try{
  const before=contents(f.db),preview=await syncParticipants({snapshot:f.snapshot,dataDirectory:f.root});
  assert.equal(preview.applied,false);assert.equal(contents(f.db),before);assert.equal(preview.createdEmployees,1);assert.equal(preview.updatedParticipants,1);
  const result=await syncParticipants({snapshot:f.snapshot,dataDirectory:f.root,apply:true});
  assert.equal(result.applied,true);assert.ok(result.backupDirectory);await verifyBackup(result.backupDirectory);
  assert.equal(f.db.prepare('SELECT employee_name FROM employees WHERE id=?').get(f.employee).employee_name,'Source Name');
  assert.equal(f.db.prepare('SELECT education_date FROM education_participants WHERE education_link_id=? AND employee_id=?').get(f.link,f.employee).education_date,'2025-01-01');
  assert.equal(f.db.prepare('SELECT education_date FROM education_participants WHERE education_link_id=? AND employee_id=?').get(f.only,f.employee).education_date,'2026-09-01');
  assert.equal(f.db.prepare('SELECT result_report_url FROM education_links WHERE id=?').get(f.link).result_report_url,'https://files.example/local-report.pdf');
  assert.equal(f.db.prepare('SELECT title FROM education_links WHERE id=?').get(f.link).title,'Keep local title');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM education_participants').get().n,3);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n,2);
  const replay=await syncParticipants({snapshot:f.snapshot,dataDirectory:f.root,apply:true});assert.equal(replay.createdParticipants,0);assert.equal(replay.createdEducation,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM education_participants').get().n,3);
  const sourceOld=f.db.prepare('SELECT local_id FROM migration_sources WHERE source_key=?').get('employees:10').local_id;assert.equal(sourceOld,f.employee);
 }finally{f.close()}
});
test('Malformed source and duplicate pairs roll back all identity changes; a zero-row source never clears local participants',async()=>{
 const f=fixture();try{
  const before=contents(f.db),bad=structuredClone(f.snapshot);bad.education_participants[1].education_date='not-a-date';
  await assert.rejects(syncParticipants({snapshot:bad,dataDirectory:f.root,apply:true}),/Invalid source education date/);assert.equal(contents(f.db),before);
  const duplicate=structuredClone(f.snapshot);duplicate.education_participants.push({...duplicate.education_participants[0],id:999});
  await assert.rejects(syncParticipants({snapshot:duplicate,dataDirectory:f.root,apply:true}),/Duplicate source participation/);assert.equal(contents(f.db),before);
  await assert.rejects(syncParticipants({snapshot:{...f.snapshot,education_participants:[]},dataDirectory:f.root,apply:true}),/No source participants/);assert.equal(contents(f.db),before);
  assert.equal(fs.readdirSync(path.join(f.root,'backups')).length,0);
 }finally{f.close()}
});
test('Two local namesakes are never merged without stable identity',async()=>{
 const f=fixture();try{
  f.store.rpc('save_employee_identity',{p_employee_name:'Local Name',p_email:'other@example.com'},true);
  const source=structuredClone(f.snapshot);source.employees[0]={id:10,employee_name:'Local Name',email:null};
  const before=contents(f.db);await assert.rejects(syncParticipants({snapshot:source,dataDirectory:f.root,apply:true}),/Ambiguous same-name/);assert.equal(contents(f.db),before);
 }finally{f.close()}
});
test('Remote export paginates fully, keeps credentials in request headers and rejects missing configuration or empty RLS results',async()=>{
 const rows=Array.from({length:1001},(_,id)=>({id:id+1})),calls=[];
 const fetchImpl=async(url,options)=>{
  const parsed=new URL(url),table=parsed.pathname.split('/').at(-1),offset=Number(parsed.searchParams.get('offset')),all=table==='education_participants'?rows:[{id:1}],page=all.slice(offset,offset+1000);
  calls.push({table,offset});assert.equal(options.redirect,'error');assert.equal(options.headers.apikey,'test-key');assert.equal(parsed.searchParams.has('apikey'),false);
  return new Response(JSON.stringify(page),{headers:{'content-range':page.length?offset+'-'+(offset+page.length-1)+'/'+all.length:'*/'+all.length}});
 };
 const snapshot=await fetchSnapshot({url:'https://source.example',key:'test-key',fetchImpl});assert.equal(snapshot.education_participants.length,1001);assert.ok(calls.some(call=>call.table==='education_participants'&&call.offset===1000));
 await assert.rejects(fetchSnapshot({url:'https://source.example'}),/SUPABASE_URL and SUPABASE_KEY/);
 await assert.rejects(fetchSnapshot({url:'https://source.example',key:'test-key',fetchImpl:async()=>new Response('[]',{headers:{'content-range':'*/0'}})}),/no participants/);
});
