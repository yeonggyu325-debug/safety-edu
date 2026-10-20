'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const defaultRoot=()=>path.resolve(process.env.SAFETY_DATA_DIR||path.join(__dirname,'../storage'));
function inside(root,target){const relative=path.relative(path.resolve(root),path.resolve(target));if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unsafe backup path');return target}
function safePath(root,relative){
 if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||relative.includes('\0')||relative.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Unsafe manifest path');
 if(relative!=='database/safety-edu.sqlite'&&!/^files\/(education|reports)\//.test(relative))throw Error('Unexpected backup file');
 const result=inside(root,path.join(root,...relative.split('/')));
 let current=path.resolve(root);for(const segment of relative.split('/')){current=path.join(current,segment);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Links are not allowed in backups')}
 return result;
}
async function sha256(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')}
async function walk(root,relative='files'){
 const absolute=inside(root,path.join(root,relative));if(!fs.existsSync(absolute))return [];
 if(fs.lstatSync(absolute).isSymbolicLink())throw Error('Linked storage folder cannot be backed up');
 const results=[];for(const entry of await fs.promises.readdir(absolute,{withFileTypes:true})){
  const next=relative+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Linked storage files cannot be backed up');
  if(entry.isDirectory())results.push(...await walk(root,next));else if(entry.isFile()&&!entry.name.endsWith('.partial'))results.push(next);
 }return results;
}
async function verifyBackup(directory){
 directory=path.resolve(directory);if(fs.lstatSync(directory).isSymbolicLink())throw Error('Backup directory must not be a link');
 const manifestFile=path.join(directory,'manifest.json');if(fs.lstatSync(manifestFile).isSymbolicLink())throw Error('Manifest must not be a link');
 const manifest=JSON.parse(await fs.promises.readFile(manifestFile,'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files)||manifest.files.length>100000)throw Error('Unsupported backup manifest');
 const seen=new Set();
 for(const item of manifest.files){
  if(seen.has(item.path)||!Number.isSafeInteger(item.size)||item.size<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Invalid backup manifest');
  seen.add(item.path);const file=safePath(directory,item.path);
  if(!fs.statSync(file).isFile()||fs.statSync(file).size!==item.size||await sha256(file)!==item.sha256)throw Error('Backup file is missing or corrupted: '+item.path);
 }
 if(!seen.has('database/safety-edu.sqlite'))throw Error('Database is missing from backup');
 const db=new DatabaseSync(safePath(directory,'database/safety-edu.sqlite'),{readOnly:true});
 try{
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup database integrity check failed');
  for(const row of db.prepare('SELECT filename,sha256,size_bytes FROM stored_files').all()){
   const item=manifest.files.find(x=>x.path==='files/education/'+row.filename);
   if(!item||item.sha256!==row.sha256||item.size!==row.size_bytes)throw Error('Stored file missing or mismatched: '+row.filename);
  }
 }finally{db.close()}
 return manifest;
}
async function createBackup({dataDirectory=defaultRoot()}={}){
 const root=path.resolve(dataDirectory),source=path.join(root,'database','safety-edu.sqlite');
 if(!fs.existsSync(source))throw Error('Start the server before creating a backup');
 const parent=path.join(root,'backups');await fs.promises.mkdir(parent,{recursive:true});
 const name='backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
 const stage=inside(parent,path.join(parent,'.partial-'+name)),destination=inside(parent,path.join(parent,name));
 await fs.promises.mkdir(path.join(stage,'database'),{recursive:true});
 try{
  const db=new DatabaseSync(source);try{db.exec('PRAGMA busy_timeout=5000');db.prepare('VACUUM INTO ?').run(path.join(stage,'database','safety-edu.sqlite'))}finally{db.close()}
  const paths=['database/safety-edu.sqlite',...await walk(root,'files/education'),...await walk(root,'files/reports')];
  const files=[];
  for(const relative of paths){
   const output=safePath(stage,relative);if(relative.startsWith('files/')){await fs.promises.mkdir(path.dirname(output),{recursive:true});await fs.promises.copyFile(safePath(root,relative),output)}
   files.push({path:relative,size:fs.statSync(output).size,sha256:await sha256(output)});
  }
  const manifest={version:1,createdAt:new Date().toISOString(),files};
  await fs.promises.writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2));
  await verifyBackup(stage);await fs.promises.rename(stage,destination);return {directory:destination,fileCount:files.length-1};
 }catch(error){inside(parent,stage);await fs.promises.rm(stage,{recursive:true,force:true});throw error}
}
async function restoreBackup({backupDirectory,targetDirectory}){
 if(!backupDirectory||!targetDirectory)throw Error('Provide backup directory and an empty --to destination');
 const source=path.resolve(backupDirectory),target=path.resolve(targetDirectory);
 if(target===source||target.startsWith(source+path.sep))throw Error('Restore destination must be separate from the backup');
 const manifest=await verifyBackup(source);
 if(fs.existsSync(target))throw Error('Restore destination already exists; use a new directory to preserve existing data');
 const parent=path.dirname(target),stage=inside(parent,path.join(parent,'.restore-'+crypto.randomUUID()));
 await fs.promises.mkdir(stage,{recursive:true});
 try{
  for(const item of manifest.files){const output=safePath(stage,item.path);await fs.promises.mkdir(path.dirname(output),{recursive:true});await fs.promises.copyFile(safePath(source,item.path),output);if(await sha256(output)!==item.sha256)throw Error('Restore copy verification failed')}
  const db=new DatabaseSync(path.join(stage,'database','safety-edu.sqlite'));try{db.prepare('DELETE FROM sessions').run();db.exec('PRAGMA wal_checkpoint(TRUNCATE)')}finally{db.close()}
  await fs.promises.mkdir(path.join(stage,'files','education'),{recursive:true});await fs.promises.mkdir(path.join(stage,'files','reports'),{recursive:true});
  await fs.promises.rename(stage,target);return {directory:target,fileCount:manifest.files.length-1};
 }catch(error){inside(parent,stage);await fs.promises.rm(stage,{recursive:true,force:true});throw error}
}
function delayToNextBackup(time=Date.now()){
 const seoul=new Date(time+9*3600000);let next=Date.UTC(seoul.getUTCFullYear(),seoul.getUTCMonth(),seoul.getUTCDate(),3)-9*3600000;
 if(next<=time)next+=24*3600000;return next-time;
}
function scheduleBackups(options={}){
 let timer,stopped=false;const plan=()=>{timer=setTimeout(async()=>{
  try{const result=await createBackup(options);console.log('Daily backup: '+result.directory)}catch(error){console.error('Daily backup failed: '+error.message)}
  if(!stopped)plan();
 },delayToNextBackup());timer.unref()};plan();return ()=>{stopped=true;clearTimeout(timer)};
}
if(require.main===module){
 const args=process.argv.slice(2);const job=args[0]==='--verify'?verifyBackup(args[1]).then(m=>({verified:true,fileCount:m.files.length-1})):
 args[0]==='--restore'?restoreBackup({backupDirectory:args[1],targetDirectory:args.includes('--to')?args[args.indexOf('--to')+1]:undefined}):createBackup();
 job.then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1});
}
module.exports={createBackup,verifyBackup,restoreBackup,delayToNextBackup,scheduleBackups};
