'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createApplication}=require('../server/server.cjs');
test('Employee CSV parser handles BOM, quoted commas and escaped quotes, reversed headers and CRLF; rejects invalid, duplicate and excessive rows',()=>{
 const ctx={window:{},document:{getElementById:()=>null}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/employee-csv.js'),'utf8'),ctx);const parse=ctx.window.employeeCsv.parse;
 const rows=parse('\uFEFF회사 이메일,사원명\r\nA@Example.com,"Kim, A"\r\nb@example.com,"Lee ""B"""\r\n');
 assert.equal(rows.length,2);assert.equal(rows[0].employee_name,'Kim, A');assert.equal(rows[0].email,'a@example.com');assert.equal(rows[1].employee_name,'Lee "B"');
 for(const invalid of ['사원명,회사 이메일\nName,invalid','사원명,회사 이메일\nA,a@example.com\nB,A@example.com','사원명,회사 이메일\n"A,a@example.com','사원명,회사 이메일,직급\nA,a@example.com,Manager','사원명,회사 이메일\n,a@example.com'])assert.throws(()=>parse(invalid));
 assert.throws(()=>parse('사원명,회사 이메일\n'+Array.from({length:5001},(_,i)=>'N'+i+',n'+i+'@example.com').join('\n')));
});
test('CSV import is admin-only, matches emails, skips identical employees, rejects conflicts atomically and preserves education history',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safety-csv-')),app=createApplication({dataDirectory:directory});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;let cookie='';
 const post=async(route,payload,anonymous=false)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:anonymous?'':cookie},body:JSON.stringify(payload)});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],...await r.json()}};
 const rpc=(name,params,anon)=>post('rpc',{name,params},anon),bulk=rows=>rpc('import_employee_identities_csv',{p_rows:rows});
 try{
  cookie=(await post('auth/setup',{email:'admin@example.com',password:'Employee-CSV-test-123'})).cookie;
  assert.equal((await rpc('import_employee_identities_csv',{p_rows:[{employee_name:'Name',email:'name@example.com'}]},true)).status,401);
  const first=await rpc('save_employee_identity',{p_employee_name:'Name',p_email:'name@example.com'}),id=first.data[0].employee_id;
  const category=app.store.db.prepare("SELECT id FROM education_categories WHERE category_code='regular'").get().id;
  const link=Number(app.store.db.prepare('INSERT INTO education_links(category_id,title) VALUES(?,?)').run(category,'Keep education').lastInsertRowid);
  await rpc('assign_employee_to_education',{p_education_link_id:link,p_employee_id:id});
  const initial=app.store.db.prepare('SELECT * FROM employees WHERE id=?').get(id);
  const result=await bulk([{employee_name:'Name',email:' NAME@EXAMPLE.COM '},{employee_name:'Name',email:'new@example.com'}]);assert.equal(result.status,200);assert.deepEqual(result.data,{created_count:1,skipped_count:1,total_count:2});
  assert.deepEqual(app.store.db.prepare('SELECT * FROM employees WHERE id=?').get(id),initial);
  const history=await rpc('get_admin_retired_training_history',{p_employee_id:id});assert.equal(history.data.length,1);assert.equal(history.data[0].root_category_code,'regular');
  const count=()=>app.store.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n,previous=count();
  for(const rows of [
   [{employee_name:'Good',email:'good@example.com'},{employee_name:'Other',email:'name@example.com'}],
   [{employee_name:'Good',email:'good@example.com'},{employee_name:'Bad',email:'invalid'}],
   [{employee_name:'Good',email:'good@example.com'},{employee_name:'Duplicate',email:'GOOD@example.com'}]
  ]){assert.ok((await bulk(rows)).status>=400);assert.equal(count(),previous);}
  assert.equal((await bulk([])).status,400);
  const special=app.store.db.prepare("SELECT id FROM education_categories WHERE category_code='special'").get().id;
  const child=Number(app.store.db.prepare('INSERT INTO education_categories(category_code,category_name,parent_id) VALUES(?,?,?)').run('work-child','Crane',special).lastInsertRowid);
  const specialLink=Number(app.store.db.prepare('INSERT INTO education_links(category_id,title) VALUES(?,?)').run(child,'Work').lastInsertRowid);
  await rpc('assign_employee_to_education',{p_education_link_id:specialLink,p_employee_id:id});
  const updated=await rpc('get_admin_retired_training_history',{p_employee_id:id});assert.equal(updated.data.find(row=>row.category_id===child).root_category_code,'special');
 }finally{await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('CSV UI previews actual file contents and commits once despite repeated clicks, then refreshes the employee list',async()=>{
 class Element{constructor(){this.children=[];this.listeners={};this.value='';}addEventListener(k,f){this.listeners[k]=f;}replaceChildren(){this.children=[];}appendChild(x){this.children.push(x);}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}}
 const ids=['employeeCsvDialog','employeeCsvFile','employeeCsvImport','employeeCsvClose','employeeCsvMessage','employeeCsvButton','employeeCsvRows','employeeCsvPreview','employeeCsvTemplate'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));let commits=0,refresh=0,resolve;
 const pending=new Promise(done=>resolve=done);const ctx={window:{},document:{getElementById:id=>nodes[id],createElement:()=>new Element()},state:{isAdmin:true},TextDecoder,setTimeout,
 addTextCell(tr,value){const cell=new Element();cell.textContent=value;tr.appendChild(cell);},
 db:{rpc(name,params){assert.equal(name,'import_employee_identities_csv');assert.equal(params.p_rows.length,2);commits++;return pending;}},
 loadAllEmployeeRosters:async()=>{refresh++},showToast(){},friendlyErrorMessage:e=>e.message};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/employee-csv.js'),'utf8'),ctx);
 nodes.employeeCsvButton.listeners.click();assert.equal(nodes.employeeCsvDialog.open,true);
 const bytes=new TextEncoder().encode('사원명,회사 이메일\nA,a@example.com\nB,b@example.com');
 nodes.employeeCsvFile.files=[{name:'employees.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}];
 await nodes.employeeCsvFile.listeners.change();assert.equal(nodes.employeeCsvRows.children.length,2);assert.equal(nodes.employeeCsvImport.disabled,false);
 const task=nodes.employeeCsvImport.listeners.click();await nodes.employeeCsvImport.listeners.click();assert.equal(commits,1);assert.equal(nodes.employeeCsvClose.disabled,true);
 resolve({data:{created_count:2,skipped_count:0},error:null});await task;
 assert.equal(refresh,1);assert.equal(nodes.employeeCsvImport.disabled,true);assert.equal(nodes.employeeCsvPreview.hidden,true);assert.equal(nodes.employeeCsvClose.disabled,false);
});
