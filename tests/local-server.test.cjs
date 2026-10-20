
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApplication}=require('../server/server.cjs');
test('Local storage: auth, authorization, departments, roster, transfer, retirement, persistence',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safety-edu-test-'));
 let app=createApplication({dataDirectory:directory});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 let base='http://127.0.0.1:'+app.server.address().port,cookie='';
 const call=async(route,payload,options={})=>{
  const response=await fetch(base+'/api/'+route,{method:payload===undefined?'GET':'POST',headers:{...(payload===undefined?{}:{'Content-Type':'application/json'}),...(options.anonymous?{}:{Cookie:cookie}),...options.headers},body:payload===undefined?undefined:JSON.stringify(payload)});
  const result=await response.json();return {response,...result};
 };
 const rpc=(name,params={})=>call('rpc',{name,params});
 const query=q=>call('query',q);
 try{
  assert.equal((await call('status')).data.setupRequired,true);
  assert.equal((await query({table:'employees'})).response.status,401);
  assert.equal((await call('query',{table:'employee_departments',action:'insert',payload:{department_name:'Bad'}},{headers:{Origin:'http://evil.example'}})).response.status,403);
  const setup=await call('auth/setup',{email:'admin@example.com',password:'Long-local-password-123'});
  assert.equal(setup.error,null);cookie=setup.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('auth/setup',{email:'other@example.com',password:'Long-local-password-123'})).response.status,409);
  assert.equal((await rpc('is_admin')).data,true);
  assert.equal((await call('auth/session')).data.session.user.email,'admin@example.com');
  const dep=(await query({table:'employee_departments',action:'insert',payload:{department_name:'환경안전',is_active:true}})).data[0];
  assert.equal(dep.is_active,true);
  const profile={p_employee_code:'EMP-001',p_employee_name:'테스트사원',p_department_id:dep.id,p_employment_status:'employed',p_hire_date:'2026-01-01',p_department_effective_date:'2026-01-01'};
  const saved=await rpc('save_employee_profile_v3',profile);assert.equal(saved.error,null);
  const id=saved.data[0].employee_id;
  assert.equal((await rpc('get_admin_employee_roster',{p_roster:'active'})).data[0].employee_name,'테스트사원');
  assert.equal((await rpc('get_department_employee_counts')).data[0].employee_count,1);
  assert.equal((await rpc('get_department_change_history',{p_department_id:dep.id})).data.length,1);
  assert.equal((await query({table:'employees',action:'update',payload:{email:'person@example.com'},filters:[{column:'id',op:'eq',value:id}]})).error,null);
  assert.equal((await query({table:'employees',action:'update',payload:{email:'bad'}})).response.status,400);
  assert.equal((await query({table:'employees;DROP TABLE employees'})).response.status,400);
  assert.equal((await rpc('hard_delete_employee',{p_employee_id:id})).response.status,400);
  const dep2=(await query({table:'employee_departments',action:'insert',payload:{department_name:'생산팀',is_active:true}})).data[0];
  assert.equal((await rpc('save_employee_profile_v3',{...profile,p_employee_id:id,p_department_id:dep2.id,p_department_effective_date:'2026-03-01'})).error,null);
  assert.equal((await rpc('get_department_change_history',{p_department_id:dep.id})).data.length,2);
  await rpc('upsert_employee_monthly_status',{p_employee_id:id,p_status:'leave',p_effective_from:'2026-04-01'});
  await rpc('upsert_employee_monthly_status',{p_employee_id:id,p_status:'employed',p_effective_from:'2026-05-01'});
  const periods=(await query({table:'employee_monthly_status_history',orders:[{column:'effective_from'}]})).data;
  assert.equal(periods[0].effective_to,'2026-04-30');
  assert.equal((await rpc('retire_employee',{p_employee_id:id,p_retirement_date:'2026-06-01'})).error,null);
  assert.equal((await rpc('get_admin_employee_roster',{p_roster:'active'})).data.length,0);
  assert.equal((await rpc('get_admin_employee_roster',{p_roster:'retired'})).data[0].email,'person@example.com');
  assert.equal((await rpc('get_department_employee_counts')).data.every(d=>d.employee_count===0),true);
  assert.equal((await rpc('attendance_get_board')).response.status,501);
  for(const file of ['/storage/database/safety-edu.sqlite','/server/server.cjs','/.git/config','/spy-reports/example.pdf','/README.md','/config/intranet.json','/config/intranet.local.json','/.env','/storage/migration/source/education_links.json','/storage/backups/manifest.json'])assert.equal((await fetch(base+file)).status,404);
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await fetch(base+'/js/config.js')).status,200);

  const vm=require('node:vm');
  const context=vm.createContext({
   fetch:(url,options={})=>fetch(base+url,{...options,headers:{...options.headers,Cookie:cookie}}),
   queueMicrotask,document:{createElement:()=>({}),querySelector:()=>({prepend(){}})}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/config.js'),'utf8')+'\nglobalThis.localDb=db;',context);
  const browserDb=context.localDb;
  const departments=await browserDb.from('employee_departments').select('id,department_name,is_active').order('department_name');
  assert.equal(departments.error,null);assert.equal(departments.data.length,2);
  const email=await browserDb.from('employees').select('id,email').in('id',[id]).single();
  assert.equal(email.data.email,'person@example.com');
  const adapterSession=await browserDb.auth.getSession();
  assert.equal(adapterSession.data.session.user.email,'admin@example.com');
  const empty=await browserDb.from('employees').select('id').eq('id',999999).maybeSingle();
  assert.equal(empty.data,null);assert.equal(empty.error,null);
  const missing=await browserDb.from('employees').select('id').eq('id',999999).single();
  assert.equal(missing.error.code,'ROW_COUNT');

  await app.close();
  app=createApplication({dataDirectory:directory});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;
  assert.equal((await call('auth/session')).data.session.user.email,'admin@example.com');
  assert.equal((await rpc('get_admin_employee_roster',{p_roster:'retired'})).data.length,1);
  const loginWrong=await call('auth/login',{email:'admin@example.com',password:'wrong'});assert.equal(loginWrong.response.status,401);
  const login=await call('auth/login',{email:'admin@example.com',password:'Long-local-password-123'});assert.equal(login.error,null);
  cookie=login.response.headers.get('set-cookie').split(';')[0];
  await call('auth/logout',{});
  assert.equal((await rpc('is_admin')).response.status,401);
  assert.equal((await query({table:'employee_departments'})).response.status,401);
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true})}
});
