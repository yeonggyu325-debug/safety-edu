'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{Readable}=require('node:stream');
const {createApplication}=require('../server/server.cjs');
test('PDF upload: admin access, original bytes, validation, deduplication, explicit linking and persisted download',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safety-pdf-upload-'));let clock=Date.now(),app,base;
 const start=async()=>{app=createApplication({dataDirectory:directory,now:()=>clock,maxUploadBytes:4096});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port};await start();
 const json=async(route,payload,cookie='')=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(payload)});return {response,...await response.json()}};
 const upload=async(bytes,cookie='',name='company.pdf',headers={})=>{const response=await fetch(base+'/api/files/pdf',{method:'POST',headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(name),Cookie:cookie,...headers},body:bytes});return {response,...await response.json()}};
 const bytes=Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
 let cookie;
 try{
  assert.equal((await upload(bytes)).response.status,401);
  const setup=await json('/api/auth/setup',{email:'upload@example.com',password:'Upload-test-password-123'});cookie=setup.response.headers.get('set-cookie').split(';')[0];
  const category=app.store.db.prepare("SELECT id FROM education_categories WHERE category_code='regular'").get().id;
  const source='https://internal.example/old.pdf',report='https://internal.example/report.pdf';
  const old=await json('/api/query',{table:'education_links',action:'insert',payload:{category_id:category,title:'Before',web_url:source,result_report_url:report}},cookie);
  const id=old.data[0].id;
  const blocked=await upload(bytes,cookie,'x.pdf',{Origin:'http://untrusted.example'});assert.equal(blocked.response.status,403);
  const uploaded=await upload(bytes,cookie,'교육자료.pdf');assert.equal(uploaded.error,null);
  const expected=crypto.createHash('sha256').update(bytes).digest('hex')+'.pdf';
  assert.equal(uploaded.data.url,'/files/'+expected);assert.equal(uploaded.data.originalName,'교육자료.pdf');
  assert.deepEqual(fs.readFileSync(path.join(directory,'files','education',expected)),bytes);
  assert.equal(app.store.db.prepare('SELECT web_url FROM education_links WHERE id=?').get(id).web_url,source);
  assert.equal((await fetch(base+uploaded.data.url)).status,404); // Not public until saved to an education item.
  assert.equal((await fetch(base+uploaded.data.url,{headers:{Cookie:cookie}})).status,200);
  const duplicate=await upload(bytes,cookie,'renamed.pdf');assert.equal(duplicate.data.url,uploaded.data.url);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM stored_files').get().n,1);
  for(const [content,name,type,status] of [
   [Buffer.from('<html>Not a PDF</html>'),'fake.pdf','application/pdf',415],
   [Buffer.from('%PDF-1.7\nmissing ending'),'truncated.pdf','application/pdf',415],
   [Buffer.alloc(0),'empty.pdf','application/pdf',415],
   [bytes,'file.exe','application/pdf',400],
   [bytes,'file.pdf','text/html',415],
   [Buffer.alloc(4097),'large.pdf','application/pdf',413]
  ])assert.equal((await upload(content,cookie,name,{'Content-Type':type})).response.status,status);
  const chunked=await fetch(base+'/api/files/pdf',{method:'POST',headers:{'Content-Type':'application/pdf','X-File-Name':'chunked.pdf',Cookie:cookie},body:Readable.from([Buffer.alloc(5000)]),duplex:'half'});
  assert.equal(chunked.status,413);
  assert.equal(fs.readdirSync(path.join(directory,'files','education')).some(name=>name.endsWith('.partial')),false);
  const saved=await json('/api/query',{table:'education_links',action:'update',payload:{web_url:uploaded.data.url},filters:[{column:'id',op:'eq',value:id}]},cookie);
  assert.equal(saved.error,null);assert.equal(saved.data[0].result_report_url,report);
  const pdf=await fetch(base+uploaded.data.url);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('x-frame-options'),'SAMEORIGIN');assert.deepEqual(Buffer.from(await pdf.arrayBuffer()),bytes);
  await app.close();await start();assert.deepEqual(Buffer.from(await(await fetch(base+uploaded.data.url)).arrayBuffer()),bytes);
  clock+=30*60*1000;assert.equal((await upload(bytes,cookie)).response.status,401);
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true})}
});
