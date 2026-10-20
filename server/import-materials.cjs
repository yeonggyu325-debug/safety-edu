
'use strict';
// One-time import; running application has no remote database dependency.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createStore}=require('./database.cjs');
function downloadUrl(source){
 const url=new URL(source),host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(!['http:','https:'].includes(url.protocol))throw Error('Only HTTP(S) download URLs are supported');
 if(['drive.google.com','docs.google.com','drive.usercontent.google.com'].includes(host)||host==='googleusercontent.com'||host.endsWith('.googleusercontent.com')||host==='googledrive.com'||host.endsWith('.googledrive.com'))throw Error('Google Drive downloads are not supported');
 return url;
}
function identify(bytes){
 if(bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))return {extension:'.pdf',type:'application/pdf'};
 if(bytes.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])))return {extension:'.xls',type:'application/vnd.ms-excel'};
 if(bytes[0]===0x50&&bytes[1]===0x4b&&bytes.includes(Buffer.from('[Content_Types].xml'))&&bytes.includes(Buffer.from('xl/')))return {extension:'.xlsx',type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
 throw Error('Response is not a PDF or Excel file (may be a login or sharing page)');
}
async function download(source,directory,fetchImpl=fetch){
 let url=downloadUrl(source),response;
 const signal=AbortSignal.timeout(60000);
 for(let redirects=0;redirects<=5;redirects++){
  response=await fetchImpl(url.href,{signal,redirect:'manual'});
  if(![301,302,303,307,308].includes(response.status))break;
  const location=response.headers.get('location');await response.body?.cancel();
  if(!location||redirects===5)throw Error('Invalid or excessive download redirects');
  url=downloadUrl(new URL(location,url).href);
 }

 if(!response.ok)throw Error('HTTP '+response.status);
 const size=Number(response.headers.get('content-length')||0);if(size>100*1024*1024)throw Error('File exceeds 100 MB');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>100*1024*1024)throw Error('File exceeds 100 MB');chunks.push(chunk)}
 const bytes=Buffer.concat(chunks),kind=identify(bytes),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const filename=hash+kind.extension,full=path.join(directory,filename);
 if(fs.existsSync(full)){const existing=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');if(existing!==hash)throw Error('Existing file checksum mismatch')}
 else{fs.writeFileSync(full+'.partial',bytes);fs.renameSync(full+'.partial',full)}
 let originalName=decodeURIComponent(new URL(source).pathname.split('/').at(-1)||'');
 const disposition=response.headers.get('content-disposition')||'';
 const extended=/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1],simple=/filename="?([^";]+)"?/i.exec(disposition)?.[1];
 try{if(extended)originalName=decodeURIComponent(extended);else if(simple)originalName=simple}catch{}
 if(!originalName.toLowerCase().endsWith(kind.extension))originalName='document'+kind.extension;
 originalName=path.basename(originalName).replace(/[\r\n"]/g,'_').slice(0,240);
 return {filename,originalName,sha256:hash,size:length,contentType:kind.type};
}
async function importSnapshot({sourceDirectory,dataDirectory,fetchImpl=fetch}){
 const categories=JSON.parse(fs.readFileSync(path.join(sourceDirectory,'education_categories.json'),'utf8'));
 const links=JSON.parse(fs.readFileSync(path.join(sourceDirectory,'education_links.json'),'utf8'));
 if(!Array.isArray(categories)||!categories.length||!Array.isArray(links))throw Error('Invalid source snapshot');
 const store=createStore(dataDirectory),results=[],files=new Map();
 const fileDirectory=path.join(dataDirectory,'files','education');fs.mkdirSync(fileDirectory,{recursive:true});
 try{
  const backup=path.join(dataDirectory,'backups','before-import-'+Date.now()+'.sqlite');store.db.prepare('VACUUM INTO ?').run(backup);
  for(const link of links)for(const field of ['web_url','result_report_url']){
   const source=link[field];if(!source)continue;
   if(!files.has(source)){
    try{files.set(source,{file:await download(source,fileDirectory,fetchImpl)})}
    catch(error){files.set(source,{error:error.message})}
   }
   const item=files.get(source);
   results.push({sourceId:link.id,title:link.title,field,sourceUrl:source,...item});
  }
  const categoryMap=new Map();
  store.transaction(()=>{
   const todo=[...categories];
   while(todo.length){
    const index=todo.findIndex(c=>!c.parent_id||categoryMap.has(Number(c.parent_id)));
    if(index<0)throw Error('Invalid category parent relationship');
    const category=todo.splice(index,1)[0],code=category.category_code||'imported-'+category.id;
    let local=store.db.prepare('SELECT id FROM education_categories WHERE category_code=?').get(code);
    const parent=category.parent_id?categoryMap.get(Number(category.parent_id)):null;
    if(local)store.db.prepare('UPDATE education_categories SET category_name=?,parent_id=?,display_order=?,is_active=? WHERE id=?').run(category.category_name,parent,category.display_order||0,Number(category.is_active!==false),local.id);
    else local={id:Number(store.db.prepare('INSERT INTO education_categories(category_code,category_name,parent_id,display_order,is_active) VALUES(?,?,?,?,?)').run(code,category.category_name,parent,category.display_order||0,Number(category.is_active!==false)).lastInsertRowid)};
    categoryMap.set(Number(category.id),Number(local.id));
   }
   const columns=new Set(store.db.prepare('PRAGMA table_info(education_links)').all().map(x=>x.name));
   for(const link of links){
    const sourceKey='education_links:'+link.id;
    const existing=store.db.prepare('SELECT local_id FROM migration_sources WHERE source_key=?').get(sourceKey);
    if(existing){
     const current=store.db.prepare("SELECT * FROM education_links WHERE id=?").get(existing.local_id);
     if(current)for(const field of ["web_url","result_report_url"]){
      const item=files.get(link[field]);if(!item?.file||current[field]!==link[field])continue;
      const f=item.file;store.db.prepare("INSERT OR IGNORE INTO stored_files(filename,original_name,content_type,size_bytes,sha256) VALUES(?,?,?,?,?)").run(f.filename,f.originalName,f.contentType,f.size,f.sha256);
      store.db.prepare("UPDATE education_links SET "+field+"=? WHERE id=?").run("/files/"+f.filename,existing.local_id);
     }continue;
    }
    const payload=Object.fromEntries(Object.entries(link).filter(([key])=>columns.has(key)&&key!=='id'));
    payload.category_id=categoryMap.get(Number(link.category_id));if(!payload.category_id)throw Error('Missing category for education '+link.id);
    for(const field of ['web_url','result_report_url']){
     const item=files.get(link[field]);if(!item?.file)continue;
     const file=item.file;
     store.db.prepare('INSERT OR IGNORE INTO stored_files(filename,original_name,content_type,size_bytes,sha256) VALUES(?,?,?,?,?)').run(file.filename,file.originalName,file.contentType,file.size,file.sha256);
     payload[field]='/files/'+file.filename;
    }
    const keys=Object.keys(payload),values=Object.values(payload).map(v=>typeof v==='boolean'?Number(v):v??null);
    const saved=store.db.prepare('INSERT INTO education_links('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...values);
    store.db.prepare('INSERT INTO migration_sources(source_key,local_id) VALUES(?,?)').run(sourceKey,Number(saved.lastInsertRowid));
   }
  });
  const report={importedCategories:categories.length,sourceEducationCount:links.length,downloadedFiles:[...files.values()].filter(x=>x.file).length,failedFiles:[...files.values()].filter(x=>x.error).length,results};
  fs.mkdirSync(path.join(dataDirectory,'migration'),{recursive:true});
  fs.writeFileSync(path.join(dataDirectory,'migration','import-report.json'),JSON.stringify(report,null,2));
  return report;
 }finally{store.close()}
}
if(require.main===module){
 const sourceDirectory=process.argv[2];
 if(!sourceDirectory){console.error('Usage: node server/import-materials.cjs <snapshot-directory>');process.exitCode=1}
 else importSnapshot({sourceDirectory:path.resolve(sourceDirectory),dataDirectory:path.resolve(process.env.SAFETY_DATA_DIR||path.join(__dirname,'../storage'))}).then(r=>console.log(JSON.stringify({categories:r.importedCategories,education:r.sourceEducationCount,downloaded:r.downloadedFiles,failed:r.failedFiles}))).catch(e=>{console.error(e.message);process.exitCode=1});
}
module.exports={importSnapshot,download,identify};
