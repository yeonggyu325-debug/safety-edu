'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {AppError}=require('./database.cjs');
const MAX_PDF_BYTES=50*1024*1024;
function createPdfUpload(store,directory,{maxBytes=MAX_PDF_BYTES}={}){
 const folder=path.join(path.resolve(directory),'files','education');let active=0;
 return async function upload(req,authorize){
  if(active>=2)throw new AppError('Uploads are busy. Try again shortly.',429,'UPLOAD_BUSY');
  if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/pdf')throw new AppError('PDF required',415,'INVALID_PDF');
  let name;try{name=decodeURIComponent(req.headers['x-file-name']||'')}catch{throw new AppError('Invalid filename',400,'INVALID_FILENAME')}
  if(!name||name.length>240||/[\x00-\x1f\x7f]/.test(name)||!name.toLowerCase().endsWith('.pdf'))throw new AppError('PDF filename required',400,'INVALID_FILENAME');
  name=name.split(/[\\/]/).at(-1);
  const length=Number(req.headers['content-length']);
  if(Number.isFinite(length)&&length>maxBytes)throw new AppError('PDF exceeds upload limit',413,'FILE_TOO_LARGE');
  const temporary=path.join(folder,'.upload-'+crypto.randomUUID()+'.partial');
  let handle,size=0,head=Buffer.alloc(0),tail=Buffer.alloc(0),final,created=false;
  const hash=crypto.createHash('sha256');active++;
  const timeout=setTimeout(()=>req.destroy(new Error('Upload timed out')),120000);timeout.unref();
  try{
   handle=await fs.promises.open(temporary,'wx');
   for await(const chunk of req.iterator({destroyOnReturn:false})){
    size+=chunk.length;if(size>maxBytes)throw new AppError('PDF exceeds upload limit',413,'FILE_TOO_LARGE');
    if(head.length<16)head=Buffer.concat([head,chunk.subarray(0,16-head.length)]);
    tail=Buffer.concat([tail,chunk]).subarray(-2048);hash.update(chunk);await handle.writeFile(chunk);
   }
   await handle.close();handle=null;
   if(!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n\t ]/.test(head.toString('latin1'))||!/%%EOF[\r\n\t ]*$/.test(tail.toString('latin1')))throw new AppError('The file is not a complete PDF',415,'INVALID_PDF');
   if(!authorize())throw new AppError('Administrator login required',401,'AUTH_REQUIRED');
   const digest=hash.digest('hex'),filename=digest+'.pdf';final=path.join(folder,filename);
   if(fs.existsSync(final)){
    const check=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(final))check.update(chunk);
    if(check.digest('hex')!==digest)throw new AppError('Stored file verification failed',409,'FILE_CONFLICT');
   }else{await fs.promises.rename(temporary,final);created=true}
   if(!authorize())throw new AppError('Administrator login required',401,'AUTH_REQUIRED');
   store.db.prepare('INSERT OR IGNORE INTO stored_files(filename,original_name,content_type,size_bytes,sha256) VALUES(?,?,?,?,?)').run(filename,name,'application/pdf',size,digest);
   const entry=store.db.prepare('SELECT original_name,size_bytes FROM stored_files WHERE filename=?').get(filename);
   return {url:'/files/'+filename,originalName:entry.original_name,size:entry.size_bytes};
  }catch(error){
   if(created&&final&&!store.db.prepare('SELECT filename FROM stored_files WHERE filename=?').get(path.basename(final)))await fs.promises.unlink(final).catch(()=>{});
   if(error instanceof AppError)throw error;
   if(error.code==='ENOSPC')throw new AppError('File storage is full',507,'STORAGE_FULL');
   throw new AppError('Upload interrupted or could not be saved',400,'UPLOAD_FAILED');
  }finally{
   clearTimeout(timeout);if(handle)await handle.close().catch(()=>{});
   await fs.promises.unlink(temporary).catch(()=>{});active--;if(!req.complete)req.resume();
  }
 };
}
module.exports={createPdfUpload,MAX_PDF_BYTES};
