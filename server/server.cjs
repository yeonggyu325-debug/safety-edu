
'use strict';
const https=require('node:https');
const {createNetworkAccess,loadIntranetSettings}=require('./intranet.cjs');
const {scheduleBackups}=require('./backup.cjs');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createStore,AppError}=require('./database.cjs');
const {createAuthentication}=require('./authentication.cjs');
const {createParticipantSearch}=require('./participant-search.cjs');
const {createPdfUpload,MAX_PDF_BYTES}=require('./pdf-upload.cjs');
const project=path.resolve(__dirname,'..');
const loopback=ip=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
function createApplication({dataDirectory=process.env.SAFETY_DATA_DIR||path.join(project,'storage'),now=Date.now,maxUploadBytes=MAX_PDF_BYTES,allowedNetworks=null,tls=null}={}){
 const allowed=allowedNetworks?createNetworkAccess(allowedNetworks):()=>true;
 const store=createStore(path.resolve(dataDirectory));
 const searchParticipants=createParticipantSearch(store.db,{AppError});
 const auth=createAuthentication(store,{now,secureCookie:Boolean(tls)||process.env.SAFETY_SECURE_COOKIE==='1'});
 const {session,passwordHash}=auth;
 const uploadPdf=createPdfUpload(store,dataDirectory,{maxBytes:maxUploadBytes});
 function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
 function error(res,err){const constraint=String(err.code||'').includes('CONSTRAINT')||/constraint failed/i.test(err.message);send(res,err.status||(constraint?400:500),{data:null,error:{message:err.status?err.message:constraint?'Duplicate record or invalid related data':'Server operation failed',code:err.code||'SERVER_ERROR'}});if(!err.status&&!constraint)console.error(err);}
 async function body(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new AppError('JSON request required',415);
  let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>2*1024*1024)throw new AppError('Request too large',413);chunks.push(chunk)}
  try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result}catch{throw new AppError('Invalid JSON')}
 }
 const handleRequest=async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  try{
   if(!allowed(req.socket.remoteAddress))throw new AppError('Intranet access only',403,'NETWORK_DENIED');
   const url=new URL(req.url,'http://localhost'),route=url.pathname;
   if(route.startsWith('/api/')){
    const current=session(req,res);
    if(req.method==='GET'&&route==='/api/status')return send(res,200,{data:{setupRequired:!store.db.prepare('SELECT id FROM admin_users LIMIT 1').get(),storage:'sqlite',stage:'employees-departments',emailEnabled:false},error:null});
    if(req.method==='GET'&&route==='/api/auth/session')return send(res,200,{data:{session:current},error:null});
    if(req.method!=='POST')throw new AppError('Method not allowed',405);
    if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host&&req.headers.origin!=='https://'+req.headers.host)throw new AppError('Invalid request origin',403);
    if(route==='/api/files/pdf'){
     if(!current)throw new AppError('Administrator login required',401,'AUTH_REQUIRED');
     return send(res,200,{data:await uploadPdf(req,()=>session(req,res)),error:null});
    }
    const payload=await body(req);
    if(route==='/api/participants/search')return send(res,200,{data:searchParticipants(payload),error:null});
    if(route==='/api/auth/setup'){
     if(!loopback(req.socket.remoteAddress))throw new AppError('First administrator must be created on the server PC',403);
     if(store.db.prepare('SELECT id FROM admin_users LIMIT 1').get())throw new AppError('Administrator is already configured',409);
     const email=String(payload.email||'').trim().toLowerCase(),password=payload.password;
     if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new AppError('Valid email required');
     if(typeof password!=='string'||password.length<12||password.length>128)throw new AppError('Password must contain 12 to 128 characters');
     const salt=crypto.randomBytes(16).toString('hex'),hash=passwordHash(password,salt);
     const id=Number(store.db.prepare('INSERT INTO admin_users(email,password_hash,salt) VALUES(?,?,?)').run(email,hash,salt).lastInsertRowid);
     return send(res,200,{data:{session:auth.loginCookie(req,res,{id,email})},error:null});
    }
    if(route==='/api/auth/login')return send(res,200,{data:auth.login(req,res,payload),error:null});
    if(route==='/api/auth/logout'){auth.logout(req,res);return send(res,200,{data:{session:null},error:null});}
    if(route==='/api/auth/activity')return send(res,200,{data:auth.activity(req,res),error:null});
    if(route==='/api/rpc'&&!current)throw new AppError('Administrator login required',401,'AUTH_REQUIRED');
    if(route==='/api/query')return send(res,200,{data:store.transaction(()=>store.query(payload,Boolean(current))),error:null});
    if(route==='/api/rpc')return send(res,200,{data:store.transaction(()=>store.rpc(payload.name,payload.params||{},Boolean(current))),error:null});
    throw new AppError('Endpoint not found',404);
   }
   if(!['GET','HEAD'].includes(req.method))throw new AppError('Method not allowed',405);

   if(route.startsWith('/files/')){
    const filename=route.slice('/files/'.length);
    if(!/^[a-f0-9]{64}\.(pdf|xlsx|xls)$/.test(filename))throw new AppError('Not found',404);
    const entry=store.db.prepare('SELECT * FROM stored_files WHERE filename=?').get(filename);
    const disk=path.join(path.resolve(dataDirectory),'files','education',filename);
    if(!entry||!fs.existsSync(disk))throw new AppError('Not found',404);
    // Anonymous downloads are limited to files linked from the education list.
    if(!session(req,res)&&!store.db.prepare('SELECT id FROM education_links WHERE web_url=? OR result_report_url=? LIMIT 1').get(route,route))throw new AppError('Not found',404);
    // Only the PDF viewer may embed a local education PDF, on this same origin.
    if(entry.content_type==='application/pdf')res.setHeader('X-Frame-Options','SAMEORIGIN');
    const size=fs.statSync(disk).size;
    const headers={'Content-Type':entry.content_type,'Content-Disposition':(entry.content_type==='application/pdf'?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(entry.original_name),'Cache-Control':'private, no-store','Accept-Ranges':'bytes'};
    let start=0,end=size-1,status=200;
    if(req.headers.range){
     const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
     if(!range||(!range[1]&&!range[2])){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end()}
     if(!range[1])start=Math.max(0,size-Number(range[2]));else start=Number(range[1]);
     if(range[1]&&range[2])end=Math.min(Number(range[2]),size-1);
     if(start>=size||start>end){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end()}
     status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
    }
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);
    if(req.method==='HEAD')res.end();else fs.createReadStream(disk,{start,end}).pipe(res);
    return;
   }
   let relative=decodeURIComponent(route).replace(/^\/+/,'');if(!relative)relative='index.html';
   if(relative==='setup.html'&&store.db.prepare('SELECT id FROM admin_users LIMIT 1').get()){res.writeHead(303,{Location:session(req,res)?'/':'/login.html','Cache-Control':'no-store'});return res.end();}
   if(relative==='setup.html'&&!loopback(req.socket.remoteAddress))throw new AppError('Setup requires the server PC',403);
   // Only application assets are public. Database, backups, reports, source and git are excluded.
   if(!['index.html','setup.html','login.html'].includes(relative)&&! /^(js|css)\/[a-zA-Z0-9-]+\.(js|css)$/.test(relative)&&relative!=='assets/company-logo.png')throw new AppError('Not found',404);
   const full=path.resolve(project,relative);if(!full.startsWith(project+path.sep))throw new AppError('Not found',404);
   if(!fs.existsSync(full))throw new AppError('Not found',404);
   const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
   res.writeHead(200,{'Content-Type':types[path.extname(full)],'Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(full).pipe(res);
  }catch(err){error(res,err)}
 };
 const server=tls?https.createServer(tls,handleRequest):http.createServer(handleRequest);
 return {server,store,close:()=>new Promise(resolve=>server.close(()=>{store.close();resolve()}))};
}
if(require.main===module){
 const lan=process.argv.includes('--lan');
 const settings=lan?loadIntranetSettings():{host:process.env.SAFETY_HOST||'127.0.0.1',port:Number(process.env.PORT||3000)};
 const app=createApplication({allowedNetworks:settings.allowedNetworks,tls:settings.tls});
 const stopBackups=scheduleBackups();
 app.server.listen(settings.port,settings.host,()=>{
  const scheme=settings.tls?'https':'http';
  console.log('Safety education server: '+scheme+'://'+(settings.displayHost||settings.host)+':'+settings.port);
  console.log('Initial administrator setup (server PC): '+scheme+'://127.0.0.1:'+settings.port+'/setup.html');
  console.log('Storage: '+path.resolve(process.env.SAFETY_DATA_DIR||path.join(project,'storage')));
  console.log('Daily full backup: 03:00 Asia/Seoul, while the server is running');
 });
 const stop=()=>{stopBackups();app.close().then(()=>process.exit(0))};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
module.exports={createApplication};
