'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createApplication}=require('../server/server.cjs');
test('Anonymous education access permits linked files but rejects private data and every write',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safety-public-')),app=createApplication({dataDirectory:directory});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(route,payload,cookie='')=>{
  const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(payload)});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 try{
  for(const route of ['/','/index.html']){const r=await fetch(base+route,{redirect:'manual'});assert.equal(r.status,200);assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(await r.text(),/id="loginButton"/)}
  const setup=await post('/api/auth/setup',{email:'admin@example.com',password:'Public-test-password-123'});
  assert.equal(setup.status,200);const cookie=setup.cookie;
  const category=app.store.db.prepare("SELECT id FROM education_categories WHERE category_code='regular'").get().id;
  const bytes=Buffer.from('%PDF-1.4\npublic test document\n'),hash=crypto.createHash('sha256').update(bytes).digest('hex'),filename=hash+'.pdf',route='/files/'+filename;
  fs.writeFileSync(path.join(directory,'files','education',filename),bytes);
  app.store.db.prepare('INSERT INTO stored_files VALUES(?,?,?,?,?)').run(filename,'material.pdf','application/pdf',bytes.length,hash);
  app.store.db.prepare('INSERT INTO education_links(category_id,title,web_url,result_report_url) VALUES(?,?,?,?)').run(category,'Public education',route,'https://files.example/report.pdf');
  const categories=await post('/api/query',{table:'education_categories'});
  assert.equal(categories.status,200);assert.ok(categories.data.data.some(x=>x.category_code==='regular'));
  const links=await post('/api/query',{table:'education_links'});assert.equal(links.status,200);assert.equal(links.data.data[0].web_url,route);
  const file=await fetch(base+route);assert.equal(file.status,200);assert.equal(file.headers.get('x-frame-options'),'SAMEORIGIN');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
  const ranged=await fetch(base+route,{headers:{Range:'bytes=0-7'}});assert.equal(ranged.status,206);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),bytes.subarray(0,8));
  for(const table of ['employees','employee_departments','education_participants','employee_monthly_status_history']){
   assert.equal((await post('/api/query',{table})).status,401);
  }
  for(const table of ['education_categories','education_links'])for(const action of ['insert','update','delete']){
   assert.equal((await post('/api/query',{table,action,payload:{title:'Unauthorized'},filters:[{column:'id',op:'eq',value:1}]})).status,401);
  }
  for(const name of ['get_current_employees','get_education_participants','save_employee_profile_v3','hard_delete_employee']){
   assert.equal((await post('/api/rpc',{name,params:{p_employee_id:1}})).status,401);
  }
  assert.equal((await post('/api/rpc',{name:'is_admin'},cookie)).data.data,true);
  assert.equal((await post('/api/query',{table:'education_links',action:'update',payload:{title:'Admin edited'},filters:[{column:'id',op:'eq',value:1}]},cookie)).status,200);
  assert.equal((await post('/api/auth/logout',{},cookie)).status,200);
  assert.equal((await fetch(base+'/',{redirect:'manual'})).status,200);
  app.store.db.prepare('UPDATE education_links SET web_url=NULL').run();
  assert.equal((await fetch(base+route)).status,404); // Unlinked storage files are not public.
  for(const url of ['/storage/database/safety-edu.sqlite','/server/server.cjs','/.git/config'])assert.equal((await fetch(base+url)).status,404);
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true})}
});
