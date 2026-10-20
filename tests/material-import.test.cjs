
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {importSnapshot}=require('../server/import-materials.cjs'),{createApplication}=require('../server/server.cjs');
test('Imports original PDF bytes, maps categories, rejects HTML, serves public education files and resumes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-files-test-')),source=path.join(root,'source'),data=path.join(root,'data');
 fs.mkdirSync(source);const bytes=Buffer.from('%PDF-1.4\noriginal-content\n%%EOF');
 fs.writeFileSync(path.join(source,'education_categories.json'),JSON.stringify([{id:50,category_code:'regular',category_name:'정기안전보건교육'}]));
 fs.writeFileSync(path.join(source,'education_links.json'),JSON.stringify([{id:73,category_id:50,title:'Original training',web_url:'https://files.example/original.pdf',result_report_url:'https://files.example/login'}]));
 const fetchImpl=async url=>new Response(url.endsWith('original.pdf')?bytes:'<html>Login required</html>',{headers:{'Content-Disposition':'attachment; filename="original.pdf"'}});
 let app;
 try{
  const report=await importSnapshot({sourceDirectory:source,dataDirectory:data,fetchImpl});
  assert.equal(report.downloadedFiles,1);assert.equal(report.failedFiles,1);
  app=createApplication({dataDirectory:data});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.com',password:'Strong-test-password-123'})});
  const cookie=setup.headers.get('set-cookie').split(';')[0];
  const link=app.store.db.prepare('SELECT * FROM education_links').get();
  assert.match(link.web_url,/^\/files\/[a-f0-9]{64}\.pdf$/);
  const disk=path.join(data,'files','education',link.web_url.split('/').at(-1));
  assert.deepEqual(fs.readFileSync(disk),bytes);
  assert.equal((await fetch(base+link.web_url)).status,200);
  const loaded=await fetch(base+link.web_url,{headers:{Cookie:cookie}});
  assert.equal(loaded.headers.get('content-type'),'application/pdf');
  assert.deepEqual(Buffer.from(await loaded.arrayBuffer()),bytes);
  const partial=await fetch(base+link.web_url,{headers:{Cookie:cookie,Range:'bytes=0-3'}});
  assert.equal(partial.status,206);assert.equal(await partial.text(),'%PDF');
  const replay=await importSnapshot({sourceDirectory:source,dataDirectory:data,fetchImpl});
  assert.equal(replay.downloadedFiles,1);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM education_links').get().n,1);
 }finally{if(app)await app.close();fs.rmSync(root,{recursive:true,force:true})}
});

test('Rejects Google Drive downloads before making any request',async()=>{
 const {download}=require('../server/import-materials.cjs');let calls=0;
 const fetchImpl=async()=>{calls++;throw Error('Unexpected network request')};
 for(const source of ['https://drive.google.com/file/d/example/view','https://docs.google.com/document/d/example','https://drive.usercontent.google.com/download?id=example','https://example.googleusercontent.com/file.pdf','https://drive.google.com./file.pdf']){
  await assert.rejects(download(source,os.tmpdir(),fetchImpl),/Google Drive downloads are not supported/);
 }
 assert.equal(calls,0);
});
test('Rejects redirects to Google Drive without following them',async()=>{
 const {download}=require('../server/import-materials.cjs');let calls=0;
 const fetchImpl=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://drive.google.com/file/d/example/view'}})};
 await assert.rejects(download('https://files.example/document.pdf',os.tmpdir(),fetchImpl),/Google Drive downloads are not supported/);
 assert.equal(calls,1);
});
test('Preserves downloads through ordinary company file redirects',async()=>{
 const {download}=require('../server/import-materials.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-redirect-test-')),calls=[],bytes=Buffer.from('%PDF-1.4\ncompany-document\n%%EOF');
 try{
  const fetchImpl=async(url,options)=>{
   calls.push(url);assert.equal(options.redirect,'manual');
   return calls.length===1?new Response(null,{status:302,headers:{Location:'/archive/document.pdf'}}):new Response(bytes);
  };
  const result=await download('https://files.example/document.pdf',root,fetchImpl);
  assert.deepEqual(calls,['https://files.example/document.pdf','https://files.example/archive/document.pdf']);
  assert.deepEqual(fs.readFileSync(path.join(root,result.filename)),bytes);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
