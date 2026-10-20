'use strict';
const {CloudError}=require('./cloud-library.cjs');
function createCloudHandler({loadLibrary,signFile}){
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});res.end(JSON.stringify(data))};
 return async(req,res)=>{
  try{
   const url=new URL(req.url,'https://localhost'),route=url.searchParams.get('route')||url.pathname.replace(/^\/api\/?/,'');
   const file=url.searchParams.get('file')||(url.pathname.startsWith('/files/')?url.pathname.slice(7):null);
   if(file){
    if(!['GET','HEAD'].includes(req.method))throw new CloudError('Method not allowed',405);
    const library=await loadLibrary();if(!library.file(file))throw new CloudError('Not found',404);
    const location=await signFile('files/'+file);res.writeHead(302,{Location:location,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});return res.end();
   }
   if(route==='status'&&req.method==='GET'){
    const library=await loadLibrary();return json(res,200,{data:{setupRequired:false,storage:'private-blob',readOnly:true,emailEnabled:false,publishedAt:library.snapshot.publishedAt},error:null});
   }
   if(route==='auth/session'&&req.method==='GET')return json(res,200,{data:{session:null},error:null});
   if(req.method!=='POST')throw new CloudError('Method not allowed',405);
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new CloudError('Invalid request origin',403);
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new CloudError('JSON request required',415);
   let body=req.body;
   if(body===undefined){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384)throw new CloudError('Request too large',413);chunks.push(chunk)}body=Buffer.concat(chunks).toString('utf8')}
   if(typeof body==='string'){if(Buffer.byteLength(body)>16384)throw new CloudError('Request too large',413);try{body=JSON.parse(body)}catch{throw new CloudError('Invalid JSON')}}
   if(!body||typeof body!=='object'||Array.isArray(body))throw new CloudError('Invalid JSON');
   if(Buffer.byteLength(JSON.stringify(body))>16384)throw new CloudError('Request too large',413);
   if(route==='auth/logout')return json(res,200,{data:{session:null},error:null});
   if(route==='participants/search'){const library=await loadLibrary();return json(res,200,{data:library.search(body),error:null})}
   if(route==='query'){const library=await loadLibrary();return json(res,200,{data:library.query(body),error:null})}
   if(route.startsWith('auth/')||route==='rpc'||route==='files/pdf')throw new CloudError('클라우드는 조회용입니다. 등록·수정은 기존 관리 서버에서 진행하세요.',403,'READ_ONLY');
   throw new CloudError('Not found',404);
  }catch(error){if(!error.status)console.error('Cloud library request failed:',error.code||error.name);json(res,error.status||503,{data:null,error:{code:error.code||'LIBRARY_UNAVAILABLE',message:error.status?error.message:'클라우드 자료에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'}})}
 };
}
module.exports={createCloudHandler};
