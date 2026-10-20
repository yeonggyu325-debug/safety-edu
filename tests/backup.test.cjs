'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createStore}=require('../server/database.cjs');
const {createBackup,verifyBackup,restoreBackup,delayToNextBackup}=require('../server/backup.cjs');
test('Full backup restores SQLite and original files, detects damage, preserves current storage and clears restored sessions',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-full-backup-')),target=root+'-restored',store=createStore(root);
 const pdf=Buffer.from('%PDF-1.7\ncompany data\n%%EOF\n'),sha=crypto.createHash('sha256').update(pdf).digest('hex'),filename=sha+'.pdf';
 try{
  fs.writeFileSync(path.join(root,'files','education',filename),pdf);
  fs.writeFileSync(path.join(root,'files','education','.upload-test.partial'),'incomplete');
  fs.writeFileSync(path.join(root,'files','reports','report.pdf'),pdf);
  store.db.prepare('INSERT INTO stored_files VALUES(?,?,?,?,?)').run(filename,'original.pdf','application/pdf',pdf.length,sha);
  const category=store.db.prepare('SELECT id FROM education_categories LIMIT 1').get().id;
  store.db.prepare('INSERT INTO education_links(category_id,title,web_url) VALUES(?,?,?)').run(category,'Saved education','/files/'+filename);
  store.db.prepare('INSERT INTO admin_users(email,password_hash,salt) VALUES(?,?,?)').run('backup@example.com','hash','salt');
  store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('token',1,Date.now()+100000,Date.now());
  const backup=await createBackup({dataDirectory:root});assert.equal(backup.fileCount,2);
  const manifest=await verifyBackup(backup.directory);assert.equal(manifest.files.length,3);
  assert.equal(fs.existsSync(path.join(backup.directory,'files','education','.upload-test.partial')),false);
  const restored=await restoreBackup({backupDirectory:backup.directory,targetDirectory:target});assert.equal(restored.fileCount,2);
  const copy=createStore(target);try{
   assert.equal(copy.db.prepare('SELECT title FROM education_links').get().title,'Saved education');
   assert.equal(copy.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
   assert.equal(copy.db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n,1);
  }finally{copy.close()}
  assert.deepEqual(fs.readFileSync(path.join(target,'files','education',filename)),pdf);assert.deepEqual(fs.readFileSync(path.join(target,'files','reports','report.pdf')),pdf);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
  await assert.rejects(restoreBackup({backupDirectory:backup.directory,targetDirectory:root}),/already exists/);
  fs.writeFileSync(path.join(backup.directory,'files','reports','report.pdf'),'corrupted');
  await assert.rejects(verifyBackup(backup.directory),/corrupted/);
  await assert.rejects(restoreBackup({backupDirectory:backup.directory,targetDirectory:root+'-bad'}),/corrupted/);
  assert.equal(fs.existsSync(root+'-bad'),false);
  fs.unlinkSync(path.join(root,'files','education',filename));
  await assert.rejects(createBackup({dataDirectory:root}),/Stored file missing/);
  assert.equal(fs.readdirSync(path.join(root,'backups')).some(name=>name.startsWith('.partial-')),false);
 }finally{store.close();for(const folder of [root,target]){const resolved=path.resolve(folder);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true})}}
});
test('Scheduled backup uses 03:00 Asia/Seoul and malformed manifest paths cannot escape the backup',async()=>{
 assert.equal(delayToNextBackup(Date.parse('2026-10-06T17:00:00Z')),3600000);
 assert.equal(delayToNextBackup(Date.parse('2026-10-06T18:00:00Z')),24*3600000);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'safety-backup-path-')),store=createStore(root);
 try{
  const backup=await createBackup({dataDirectory:root}),manifest=JSON.parse(fs.readFileSync(path.join(backup.directory,'manifest.json')));
  manifest.files[0].path='../outside.sqlite';fs.writeFileSync(path.join(backup.directory,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(verifyBackup(backup.directory),/Unsafe manifest path/);
 }finally{store.close();assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true})}
});
