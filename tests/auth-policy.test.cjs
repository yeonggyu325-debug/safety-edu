
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createApplication}=require('../server/server.cjs');
const {POLICY}=require('../server/authentication.cjs');
async function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safety-auth-policy-'));
 let clock=Date.now(),app,base,cookie='';
 async function start(){
  app=createApplication({dataDirectory:directory,now:()=>clock});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+app.server.address().port;
 }
 await start();
 const request=async(route,payload,headers={})=>{
  const response=await fetch(base+route,{redirect:'manual',method:payload===undefined?'GET':'POST',headers:{Cookie:cookie,...(payload===undefined?{}:{'Content-Type':'application/json'}),...headers},body:payload===undefined?undefined:JSON.stringify(payload)});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  const data=response.headers.get('content-type')?.includes('application/json')?await response.json():null;
  return {response,...data};
 };
 const setup=()=>request('/api/auth/setup',{email:'policy@example.com',password:'Policy-test-password-123'});
 const login=(password='Policy-test-password-123',email='policy@example.com')=>request('/api/auth/login',{email,password});
 return {
  request,setup,login,advance:ms=>clock+=ms,get app(){return app},get cookie(){return cookie},set cookie(value){cookie=value},
  restart:async()=>{await app.close();await start()},
  close:async()=>{await app.close();fs.rmSync(directory,{recursive:true,force:true})}
 };
}
test('Three failed logins lock one account for 15 minutes, survive restart, and reset after success',async()=>{
 const f=await fixture();
 try{
  await f.setup();
  assert.equal((await f.login('wrong')).response.status,401);
  assert.equal((await f.login('wrong','other@example.com')).response.status,401);
  assert.equal((await f.login('wrong')).response.status,401);
  assert.equal((await f.login()).response.status,200); // Success resets the two failures.
  assert.equal((await f.login('wrong')).response.status,401);
  assert.equal((await f.login('wrong')).response.status,401);
  const third=await f.login('wrong');assert.equal(third.response.status,429);assert.equal(third.error.code,'ACCOUNT_LOCKED');
  assert.equal((await f.login()).response.status,429);
  await f.restart();
  assert.equal((await f.login()).response.status,429);
  assert.equal((await f.login('wrong','other@example.com')).response.status,401); // Accounts remain independent.
  f.advance(POLICY.lockMs);
  assert.equal((await f.login()).response.status,200);
  assert.equal(f.app.store.db.prepare('SELECT COUNT(*) AS n FROM auth_login_failures WHERE failed_count>=3').get().n,0);
 }finally{await f.close()}
});
test('Admin idle expiry is enforced server-side while education remains publicly readable',async()=>{
 const f=await fixture();
 try{
  assert.equal((await f.request('/')).response.status,200);
  await f.setup();const initialCookie=f.cookie;
  for(const table of ['employees','employee_departments','education_participants']){
   f.cookie='';assert.equal((await f.request('/api/query',{table})).response.status,401);
  }
  assert.equal((await f.request('/api/rpc',{name:'is_admin'})).response.status,401);
  assert.equal((await f.request('/')).response.status,200);
  assert.equal((await f.request('/login.html')).response.status,200);
  f.cookie=initialCookie;
  f.advance(29*60000);
  assert.ok((await f.request('/api/auth/session')).data.session);
  assert.equal((await f.request('/api/query',{table:'education_links'})).response.status,200);
  await f.restart(); // Restart does not reset the idle clock.
  f.advance(60000);
  const expired=await f.request('/api/auth/session');
  assert.equal(expired.data.session,null);assert.match(expired.response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await f.request('/api/query',{table:'education_categories'})).response.status,200);
  assert.equal((await f.request('/api/query',{table:'employees'})).response.status,401);
  assert.equal((await f.request('/files/'+ 'a'.repeat(64)+'.pdf')).response.status,404);
  assert.equal((await f.request('/api/auth/activity',{})).response.status,401);
  await f.login();f.advance(29*60000);
  const activity=await f.request('/api/auth/activity',{});
  assert.equal(activity.response.status,200);assert.match(activity.response.headers.get('set-cookie'),/Max-Age=1800/);
  f.advance(29*60000);assert.ok((await f.request('/api/auth/session')).data.session);
  f.advance(60000);assert.equal((await f.request('/api/query',{table:'education_links'})).response.status,200);
  assert.equal((await f.request('/api/query',{table:'education_links',action:'delete',filters:[{column:'id',op:'eq',value:1}]})).response.status,401);
 }finally{await f.close()}
});
test('Re-login invalidates the replaced session and activity cannot extend the absolute 8-hour maximum',async()=>{
 const f=await fixture();
 try{
  await f.setup();const oldCookie=f.cookie;
  await f.login();const newCookie=f.cookie;assert.notEqual(newCookie,oldCookie);
  f.cookie=oldCookie;assert.equal((await f.request('/api/auth/session')).data.session,null);f.cookie=newCookie;
  for(let i=0;i<16;i++){f.advance(29*60000);assert.equal((await f.request('/api/auth/activity',{})).response.status,200)}
  f.advance(16*60000);
  assert.equal((await f.request('/api/auth/activity',{})).response.status,401);
  assert.equal(f.app.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
 }finally{await f.close()}
});
test('Legacy sessions without an activity timestamp are invalidated during migration; accounts remain intact',async()=>{
 const f=await fixture();
 try{
  await f.setup();
  const token=crypto.randomBytes(32).toString('hex');
  f.app.store.db.exec('DROP TABLE sessions; CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES admin_users(id),expires_at INTEGER NOT NULL)');
  f.app.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),1,Date.now()+POLICY.absoluteMs);
  f.cookie='safety_session='+token;
  await f.restart();
  assert.equal((await f.request('/api/auth/session')).data.session,null);
  assert.equal(f.app.store.db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n,1);
  assert.equal((await f.login()).response.status,200);
 }finally{await f.close()}
});
