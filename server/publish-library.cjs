'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {fields,createLibrary,filePattern}=require('./cloud-library.cjs');
function buildSnapshot(db){
 db.exec('BEGIN');
 try{
  const categories=db.prepare('SELECT * FROM education_categories').all(),byId=new Map(categories.map(c=>[c.id,c]));
  function visible(c,seen=new Set()){
   if(!c||!c.is_active||seen.has(c.id))return false;
   if(String(c.category_code).toLowerCase().includes('regular')||String(c.category_name).replace(/\s/g,'').includes('정기'))return false;
   seen.add(c.id);return c.parent_id?visible(byId.get(c.parent_id),seen):true;
  }
  const cats=categories.filter(c=>visible(c)),ids=new Set(cats.map(c=>c.id));
  const links=db.prepare('SELECT * FROM education_links ORDER BY id').all().filter(l=>ids.has(l.category_id)&&l.is_active!==0);
  const linkIds=new Set(links.map(l=>l.id));
  const participants=db.prepare("SELECT * FROM education_participants WHERE target_status='target' ORDER BY id").all().filter(p=>linkIds.has(p.education_link_id));
  const personIds=new Set(participants.map(p=>p.employee_id)),people=db.prepare('SELECT * FROM employees ORDER BY id').all().filter(e=>personIds.has(e.id)),deptIds=new Set(people.map(e=>e.department_id));
  const departments=db.prepare('SELECT * FROM employee_departments ORDER BY id').all().filter(d=>deptIds.has(d.id));
  const snapshot={schemaVersion:1,publishedAt:new Date().toISOString(),files:[]};
  const source={education_categories:cats,education_links:links,employees:people,employee_departments:departments,education_participants:participants};
  for(const [t,rows]of Object.entries(source))snapshot[t]=rows.map(row=>Object.fromEntries(Object.keys(fields[t]).map(k=>[k,k==='is_active'?row[k]!==0:row[k]??null])));
  const referenced=new Set();for(const l of links)for(const url of [l.web_url,l.result_report_url])if(typeof url==='string'&&url.startsWith('/files/')){const name=url.slice(7);if(!filePattern.test(name))throw Error('Invalid linked filename');referenced.add(name)}
  for(const name of referenced){const file=db.prepare('SELECT * FROM stored_files WHERE filename=?').get(name);if(!file)throw Error('Linked file metadata missing');snapshot.files.push(file)}
  db.exec('COMMIT');return snapshot;
 }catch(error){db.exec('ROLLBACK');throw error}
}
async function publishLibrary({dataDirectory=process.env.SAFETY_DATA_DIR||path.join(__dirname,'../storage'),apply=false,putBlob,getBlob}={}){
 const dir=path.resolve(dataDirectory),db=new DatabaseSync(path.join(dir,'database/safety-edu.sqlite'),{readOnly:true});
 let snapshot;try{snapshot=buildSnapshot(db)}finally{db.close()}
 const library=createLibrary(snapshot);library.close();
 const text=JSON.stringify(snapshot),sha=crypto.createHash('sha256').update(text).digest('hex');
 if(Buffer.byteLength(text)>8*1024*1024)throw Error('Snapshot exceeds 8MB');
 const exportDir=path.join(dir,'cloud-exports');fs.mkdirSync(exportDir,{recursive:true});
 const file=path.join(exportDir,'library-'+sha+'.json');fs.writeFileSync(file,text);
 const result={applied:false,educationRecords:snapshot.education_links.length,searchablePeople:snapshot.employees.length,participations:snapshot.education_participants.length,linkedFiles:snapshot.files.length,sha256:sha,sourceFile:file};
 if(!apply)return result;
 const sdk=putBlob&&getBlob?null:require('@vercel/blob');putBlob=putBlob||sdk.put;getBlob=getBlob||sdk.get;
 for(const meta of snapshot.files){
  const bytes=fs.readFileSync(path.join(dir,'files/education',meta.filename));
  if(bytes.length!==meta.size_bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error('Linked file verification failed');
  await putBlob('files/'+meta.filename,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:meta.content_type,contentDisposition:'inline',multipart:bytes.length>4*1024*1024});
 }
 // Keep an immutable revision before replacing the live projection.
 await putBlob('library/revisions/'+sha+'.json',text,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
 await putBlob('library/current.json',text,{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
 const check=await getBlob('library/current.json',{access:'private',useCache:false});
 if(!check||check.statusCode!==200)throw Error('Published snapshot could not be verified');
 const bytes=Buffer.from(await new Response(check.stream).arrayBuffer());
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('Published snapshot verification failed');
 return {...result,applied:true,publishedAt:snapshot.publishedAt};
}
module.exports={buildSnapshot,publishLibrary};
if(require.main===module)publishLibrary({apply:process.argv.includes('--apply')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(error=>{console.error('Library publish failed: '+error.message);process.exitCode=1});
