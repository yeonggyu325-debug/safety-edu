'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createStore,AppError}=require('../server/database.cjs'),{createParticipantSearch}=require('../server/participant-search.cjs');
const {buildSnapshot,publishLibrary}=require('../server/publish-library.cjs'),{createLibrary,createLibraryLoader}=require('../server/cloud-library.cjs'),{createCloudHandler}=require('../server/cloud-handler.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-cloud-')),store=createStore(root),db=store.db;
 const dept=Number(db.prepare("INSERT INTO employee_departments(department_name) VALUES('Production')").run().lastInsertRowid);
 const a=store.rpc('save_employee_identity',{p_employee_name:'Alice',p_email:'private-alice@example.com'},true)[0].employee_id,b=store.rpc('save_employee_identity',{p_employee_name:'Bob',p_email:'private-bob@example.com'},true)[0].employee_id;
 for(const id of [a,b])db.prepare("UPDATE employees SET department_id=?,note='PRIVATE_HR' WHERE id=?").run(dept,id);
 const cats=db.prepare('SELECT * FROM education_categories').all(),cat=c=>cats.find(r=>r.category_code===c).id;
 for(const [title,c,status,active]of [['Special','special','target',1],['Hiring','hiring','target',1],['Regular','regular','target',1],['Excluded','special','excluded',1],['Inactive','special','target',0]]){
  const id=Number(db.prepare('INSERT INTO education_links(category_id,title,first_session_date,result_report_url,is_active) VALUES(?,?,?,?,?)').run(cat(c),title,'2026-10-01','https://reports.example/'+title+'.pdf',active).lastInsertRowid);
  for(const employee of [a,b])db.prepare('INSERT INTO education_participants(education_link_id,employee_id,target_status) VALUES(?,?,?)').run(id,employee,status);
 }
 return {root,store,db,close(){store.close();fs.rmSync(root,{recursive:true,force:true})}};
}
const blob=bytes=>({statusCode:200,blob:{etag:'test'},stream:new Response(bytes).body});
test('Cloud projection excludes private data and regular/inactive records; lookup matches the local API and rejects every private query or mutation',()=>{
 const f=fixture();try{
  const snapshot=buildSnapshot(f.db),text=JSON.stringify(snapshot),library=createLibrary(snapshot),local=createParticipantSearch(f.db,{AppError});
  try{
   for(const secret of ['private-alice@example.com','PRIVATE_HR','Regular','Inactive','password_hash','employee_code'])assert.ok(!text.includes(secret));
   assert.equal(snapshot.education_links.length,3);
   for(const payload of [{name:'Alice'},{mode:'department',department:'Prod'}])assert.deepEqual(library.search(payload),local(payload));
   assert.equal(library.search({mode:'department',department:'Prod'}).matches[0].history.length,2);
   assert.equal(library.query({table:'education_links',columns:'id,title',orders:[{column:'id'}]}).length,3);
   assert.equal(library.query({table:'education_categories',filters:[{op:'eq',column:'is_active',value:true}]}).length,2);
   assert.throws(()=>library.query({table:'employees'}),/관리자/);
   assert.throws(()=>library.query({table:'education_links',action:'delete'}),/조회/);
   assert.throws(()=>library.query({table:'education_links',columns:'id;DROP TABLE employees'}));
   assert.equal(library.file('../library/current.json'),null);
  }finally{library.close()}
 }finally{f.close()}
});
test('Publishing keeps source data unchanged, stores only private blobs, verifies bytes and caches published reads without masking failures',async()=>{
 const f=fixture();try{
  const before=JSON.stringify(f.db.prepare('SELECT * FROM employees').all()),objects=new Map(),calls=[];
  const put=async(name,data,options)=>{calls.push({name,options});objects.set(name,Buffer.from(data));return {pathname:name}};
  const get=async(name)=>objects.has(name)?blob(objects.get(name)):null;
  assert.equal((await publishLibrary({dataDirectory:f.root})).applied,false);assert.equal(objects.size,0);
  const result=await publishLibrary({dataDirectory:f.root,apply:true,putBlob:put,getBlob:get});assert.equal(result.applied,true);
  assert.ok(calls.every(c=>c.options.access==='private'));assert.ok(calls.some(c=>c.name.startsWith('library/revisions/')));
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM employees').all()),before);
  let reads=0,now=0;const load=createLibraryLoader(async(...args)=>{reads++;return get(...args)},{now:()=>now});
  const [first,second]=await Promise.all([load(),load()]);assert.equal(first,second);assert.equal(reads,1);
  assert.equal((await load()).search({name:'Alice'}).matches.length,1);assert.equal(reads,1);
  now=31000;await load();assert.equal(reads,2);
  await assert.rejects(createLibraryLoader(async()=>null)(),/게시/);
  await assert.rejects(publishLibrary({dataDirectory:f.root,apply:true,putBlob:put,getBlob:async()=>blob('bad')}),/verification/);
 }finally{f.close()}
});
test('Cloud handler returns actual data for public requests, JSON for missing routes, blocks auth/writes and never serves the private snapshot',async()=>{
 const f=fixture(),library=createLibrary(buildSnapshot(f.db));const server=http.createServer(createCloudHandler({loadLibrary:async()=>library,signFile:async()=>{throw Error('Unexpected file signing')}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,payload)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,...await r.json()}};
 try{
  const status=await(await fetch(base+'/api/status')).json();assert.equal(status.data.readOnly,true);assert.equal(status.data.setupRequired,false);
  assert.equal((await(await fetch(base+'/api/auth/session')).json()).data.session,null);
  assert.equal((await post('/api?route=participants/search',{mode:'department',department:'Prod'})).data.matches[0].history.length,2);
  assert.equal((await post('/api/query',{table:'education_links'})).data.length,3);
  for(const route of ['/api/auth/setup','/api/auth/login','/api/rpc','/api/files/pdf'])assert.equal((await post(route,{})).status,403);
  assert.equal((await post('/api/query',{table:'employees'})).status,401);
  assert.equal((await post('/api/query',{table:'education_links',action:'insert'})).status,403);
  const missing=await post('/api/unknown',{});assert.equal(missing.status,404);assert.ok(missing.error);
  for(const route of ['/files/current.json','/files/../library/current.json'])assert.ok((await fetch(base+route)).status>=400);
  const cross=await fetch(base+'/api/participants/search',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{"name":"Alice"}'});assert.equal(cross.status,403);
 }finally{await new Promise(resolve=>server.close(resolve));library.close();f.close()}
});
