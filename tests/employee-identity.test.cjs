'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createApplication}=require('../server/server.cjs');
test('Employee identity requires only name and email, matches exactly, rejects duplicate emails and preserves legacy education data',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'safety-identity-')),app=createApplication({dataDirectory:directory});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;let cookie='';
 const call=async(route,payload,anonymous=false)=>{const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Cookie:anonymous?'':cookie},body:JSON.stringify(payload)});return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],...await response.json()}};
 const rpc=(name,params,anonymous=false)=>call('rpc',{name,params},anonymous),query=p=>call('query',p);
 try{
  cookie=(await call('auth/setup',{email:'admin@example.com',password:'Identity-test-password-123'})).cookie;
  assert.equal((await rpc('save_employee_identity',{p_employee_name:'Person',p_email:'person@example.com'},true)).status,401);
  const first=await rpc('save_employee_identity',{p_employee_name:' Person ',p_email:' Person@Example.COM '});assert.equal(first.status,200);assert.equal(first.data[0].email,'person@example.com');assert.equal(first.data[0].employee_name,'Person');
  const id=first.data[0].employee_id;
  assert.equal((await rpc('save_employee_identity',{p_employee_name:'Other',p_email:'PERSON@example.com'})).status,409);
  const sameName=await rpc('save_employee_identity',{p_employee_name:'Person',p_email:'other@example.com'});assert.equal(sameName.status,200);assert.notEqual(sameName.data[0].employee_id,id);
  const found=await rpc('find_employee_identity',{p_employee_name:'Person',p_email:'PERSON@EXAMPLE.COM'});assert.equal(found.data[0].employee_id,id);
  assert.equal((await rpc('find_employee_identity',{p_employee_name:'Wrong name',p_email:'person@example.com'})).data.length,0);
  assert.equal((await rpc('find_employee_identity',{p_email:'missing@example.com'})).data.length,0);
  assert.equal((await rpc('find_employee_identity',{p_email:'person@example.com'},true)).status,401);
  for(const params of [{p_employee_name:'',p_email:'valid@example.com'},{p_employee_name:'Name',p_email:'not-an-email'},{p_employee_id:99999,p_employee_name:'Name',p_email:'valid@example.com'}])assert.ok((await rpc('save_employee_identity',params)).status>=400);
  const legacy=app.store.db.prepare('SELECT * FROM employees WHERE id=?').get(id);
  app.store.db.prepare("UPDATE employees SET job_title='Manager',hire_date='2020-01-01',employment_status='leave',note='keep history' WHERE id=?").run(id);
  const category=app.store.db.prepare('SELECT id FROM education_categories LIMIT 1').get().id;
  const link=Number(app.store.db.prepare('INSERT INTO education_links(category_id,title) VALUES(?,?)').run(category,'Existing education').lastInsertRowid);
  await rpc('assign_employee_to_education',{p_education_link_id:link,p_employee_id:id});
  await rpc('save_employee_identity',{p_employee_id:id,p_employee_name:'Updated name',p_email:'updated@example.com'});
  const updated=app.store.db.prepare('SELECT * FROM employees WHERE id=?').get(id);
  assert.equal(updated.department_id,legacy.department_id);assert.equal(updated.employee_code,legacy.employee_code);assert.equal(updated.job_title,'Manager');assert.equal(updated.hire_date,'2020-01-01');assert.equal(updated.employment_status,'leave');assert.equal(updated.note,'keep history');
  const participants=(await rpc('get_education_participants',{p_education_link_id:link})).data;assert.equal(participants[0].employee_name,'Updated name');assert.equal(participants[0].email,'updated@example.com');
  assert.equal((await query({table:'employees',action:'update',payload:{email:'UPDATED@example.com'},filters:[{column:'id',op:'eq',value:sameName.data[0].employee_id}]})).status,409);
  const concurrent=await Promise.all(['One','Two'].map(name=>rpc('save_employee_identity',{p_employee_name:name,p_email:'race@example.com'})));assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
 }finally{await app.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true})}
});
test('Employee form contains only two visible inputs and submits identity fields without HR controls',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),form=html.match(/<form id="employeeForm">([\s\S]*?)<\/form>/)[1];
 const inputs=[...form.matchAll(/<input\b[^>]*>/g)].map(x=>x[0]).filter(x=>!x.includes('type="hidden"'));
 assert.equal(inputs.length,2);assert.ok(inputs[0].includes('id="employeeName"'));assert.ok(inputs[1].includes('id="employeeEmail"'));
 for(const id of ['employeeJobTitle','employeeTransferDate','employeeStatusSelect','employeeNote','employeeDepartment','employeeHireDate'])assert.equal(form.includes(id),false);
 const fields={employeeName:{value:'Name'},employeeEmail:{value:' NAME@EXAMPLE.COM '},employeeId:{value:''},employeeFormError:{textContent:''}};
 const submit={textContent:'Save',disabled:false};fields.employeeForm={dataset:{},reportValidity:()=>true,querySelector:()=>submit};
 let values;
 const context=vm.createContext({$:id=>fields[id],db:{rpc:async(name,p)=>{assert.equal(name,'save_employee_identity');values=p;return {data:[{employee_id:1}],error:null}}},state:{},closeModal(){},showToast(){},loadAllEmployeeRosters:async()=>{},friendlyErrorMessage:()=> 'Failed'});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/employees.js'),'utf8'),context);await context.saveEmployee({preventDefault(){}});
 assert.deepEqual(Object.keys(values).sort(),['p_email','p_employee_id','p_employee_name']);assert.equal(values.p_email,'name@example.com');assert.equal(submit.disabled,false);
});

test('Identity list renders name and email and searches both fields without matching people by name alone',()=>{
 class Element{
  constructor(){this.children=[];this.value='';this.textContent='';this.listeners={};this.hidden=false}
  appendChild(node){this.children.push(node);return node}replaceChildren(...nodes){this.children=[...nodes]}
  setAttribute(key,value){this[key]=value}addEventListener(type,callback){this.listeners[type]=callback}
  querySelector(selector){return this.lookup?.[selector]||null}
 }
 const ids=['activeEmployeePanel','retiredEmployeePanel','activeEmployeeTableBody','retiredEmployeeTableBody','activeEmployeeSearch','retiredEmployeeSearch','activeEmployeePagination','retiredEmployeePagination','selectAllActiveEmployees','retiredSelectAll','retiredSelectionText','retiredBulkDeleteButton','pageTitle'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const heads={};
 for(const key of ['active','retired']){const table=new Element(),head=new Element(),group=new Element();table.lookup={'thead tr':head,colgroup:group};nodes[key+'EmployeePanel'].lookup={table};heads[key]=head}
 const state={activeEmployees:[{employee_id:1,employee_name:'Same',email:'persona@example.com'},{employee_id:2,employee_name:'Same',email:'personb@example.com'}],retiredEmployees:[],retiredEmployeeSelected:new Set()};
 let edited;
 const context=vm.createContext({document:{getElementById:id=>nodes[id],querySelectorAll:()=>[],createElement:()=>new Element()},state,
  addTextCell:(tr,text,cls)=>{const td=new Element();td.textContent=text;td.className=cls;tr.appendChild(td);return td},
  setStatus(){},openEmployeeForm:row=>edited=row,openRetiredHistory(){},showView(){},renderActiveEmployees(){},renderRetiredEmployees(){},window:{}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/employee-identity-ui.js'),'utf8'),context);
 context.renderActiveEmployees();assert.equal(nodes.activeEmployeeTableBody.children.length,2);assert.equal(heads.active.children.length,4);
 assert.equal(nodes.activeEmployeeTableBody.children[0].children[2].textContent,'persona@example.com');
 nodes.activeEmployeeSearch.value='Same PERSONB@EXAMPLE.COM';nodes.activeEmployeeSearch.listeners.input();
 assert.equal(nodes.activeEmployeeTableBody.children.length,1);assert.equal(nodes.activeEmployeeTableBody.children[0].children[2].textContent,'personb@example.com');
 nodes.activeEmployeeTableBody.children[0].children[3].children[0].onclick();assert.equal(edited.employee_id,2);
});
