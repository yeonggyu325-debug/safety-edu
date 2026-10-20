
'use strict';
// Local API facade preserves the existing screens while individual features migrate.
const db=(()=>{
 const listeners=new Set();let redirecting=false;
 async function request(route,payload){
  try{
   const response=await fetch('/api/'+route,{method:payload===undefined?'GET':'POST',credentials:'same-origin',headers:payload===undefined?{}:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});
   const result=await response.json();
   if(response.status===401&&result.error?.code==='AUTH_REQUIRED'){
    notify('SIGNED_OUT',null);
    if(!redirecting&&typeof window!=='undefined'){redirecting=true;document.querySelector('main')?.setAttribute('hidden','');window.location.replace('/')}
   }
   return result;
  }catch{return {data:null,error:{code:'NETWORK',message:'사내 서버에 연결하지 못했습니다. 서버 실행 상태를 확인하세요.'}}}
 }
 class Query{
  constructor(table){this.query={table,action:'select',filters:[],orders:[]};this.shape=null;this.promise=null}
  select(columns='*'){this.query.columns=columns;return this}
  insert(payload){this.query.action='insert';this.query.payload=payload;return this}
  update(payload){this.query.action='update';this.query.payload=payload;return this}
  delete(){this.query.action='delete';return this}
  filter(op,column,value){this.query.filters.push({op,column,value});return this}
  eq(c,v){return this.filter('eq',c,v)}in(c,v){return this.filter('in',c,v)}
  lte(c,v){return this.filter('lte',c,v)}gte(c,v){return this.filter('gte',c,v)}
  neq(c,v){return this.filter('neq',c,v)}is(c,v){return this.filter('is',c,v)}
  or(value){this.query.or=value;return this}
  order(column,options={}){this.query.orders.push({column,...options});return this}
  range(from,to){this.query.offset=from;this.query.limit=to-from+1;return this}
  limit(value){this.query.limit=value;return this}
  single(){this.shape='single';return this}maybeSingle(){this.shape='maybe';return this}
  then(resolve,reject){
   if(!this.promise)this.promise=request('query',this.query).then(result=>{
    if(result.error||!this.shape)return result;
    const rows=result.data||[];
    if(rows.length>1||(this.shape==='single'&&rows.length!==1))return {data:null,error:{code:'ROW_COUNT',message:'요청한 항목을 찾을 수 없습니다.'}};
    return {data:rows[0]||null,error:null};
   });
   return this.promise.then(resolve,reject);
  }
 }
 const notify=(event,session)=>listeners.forEach(fn=>queueMicrotask(()=>fn(event,session)));
 const auth={
  getSession:()=>request('auth/session'),
  async signInWithPassword(values){const result=await request('auth/login',values);if(!result.error)notify('SIGNED_IN',result.data.session);return result},
  async signOut(){const result=await request('auth/logout',{});if(!result.error)notify('SIGNED_OUT',null);return result},
  onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}}},
 };
 return {
  from:table=>new Query(table),rpc:(name,params={})=>request('rpc',{name,params}),auth,
  // No live change subscription yet. Existing attendance fallback polling remains.
  channel:()=>({on(){return this},subscribe(callback){queueMicrotask(()=>callback?.('CLOSED'));return this}}),
  removeChannel:async()=>{}
 };
})();
fetch('/api/status').then(r=>r.json()).then(result=>{
 if(result.data?.setupRequired&&typeof location!=='undefined'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)){const link=document.createElement('a');link.href='/setup.html';link.className='btn btn-secondary';link.textContent='최초 관리자 설정';document.querySelector('.top-actions')?.prepend(link)}
}).catch(()=>{});
