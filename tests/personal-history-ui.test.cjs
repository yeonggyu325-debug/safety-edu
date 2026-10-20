'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../js/personal-history.js'),'utf8');
function fixture(admin=false,rpc=async()=>({data:[],error:null})){
 class Element{
  constructor(){this.value='';this.textContent='';this.children=[];this.hidden=false;this.listeners={};this.attributes={};this.classList={toggle(){}};}
  setAttribute(key,value){this.attributes[key]=value;}focus(){this.focused=true;}
  addEventListener(type,fn){this.listeners[type]=fn;}replaceChildren(){this.children=[];}appendChild(x){this.children.push(x);}
  reset(){}reportValidity(){return true;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}
 }
 const ids=['personalHistoryDialog','personalHistoryForm','personalHistorySubmit','personalHistoryRows','personalHistoryResult','personalHistoryMessage','personalHistoryIdentity','personalHistoryCount','personalHistoryName','personalHistoryEmail','personalHistoryNotice','personalHistoryButton','personalHistoryClose','personalHistoryTab-regular','personalHistoryTab-hiring','personalHistoryTab-special','personalHistoryPanel'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));const calls=[];
 const ctx={document:{getElementById:id=>nodes[id],createElement:()=>new Element()},state:{isAdmin:admin},window:{},openRetiredHistory(){},
 db:{rpc:async(name,params)=>{calls.push({name,params});return rpc(name,params)}},
 addTextCell(tr,value,cls){const cell=new Element();cell.textContent=value;cell.className=cls;tr.appendChild(cell);return cell},
 formatDateDot:value=>value,friendlyErrorMessage:error=>error.message};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,nodes,calls};
}
test('Public personal history window cannot request private employee data and removed monthly/archive views stay absent',async()=>{
 const {nodes,calls}=fixture();nodes.personalHistoryButton.listeners.click();assert.equal(nodes.personalHistoryDialog.open,true);assert.equal(nodes.personalHistorySubmit.disabled,true);
 await nodes.personalHistoryForm.listeners.submit({preventDefault(){}});assert.equal(calls.length,0);assert.equal(nodes.personalHistoryResult.hidden,true);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');for(const id of ['regularHalfYearImportButton','educationMonthlyPanel','retiredEmployeePanel','retiredEmployeeTab'])assert.ok(!html.includes('id="'+id+'"'));
 assert.ok(!html.includes('src="js/monthly-'));assert.ok(html.includes('id="personalHistoryDialog"'));
});
test('Administrator history lookup matches name/email before fetching one employee, renders actual dates, and clears previous results on no match',async()=>{
 let found=true;const {nodes,calls}=fixture(true,async name=>name==='find_employee_identity'?{data:found?[{employee_id:7,employee_name:'Name',email:'name@example.com'}]:[],error:null}:{data:[{category_name:'Special',title:'Crane',first_session_date:'2026-10-02',education_date:'2026-10-06',education_date_2:'2026-10-07',target_status:'target'}],error:null});
 nodes.personalHistoryButton.listeners.click();nodes.personalHistoryName.value=' Name ';nodes.personalHistoryEmail.value=' NAME@EXAMPLE.COM ';
 await nodes.personalHistoryForm.listeners.submit({preventDefault(){}});
 assert.equal(calls[0].params.p_employee_name,'Name');assert.equal(calls[0].params.p_email,'name@example.com');assert.equal(calls[1].params.p_employee_id,7);
 assert.equal(nodes.personalHistoryRows.children.length,1);assert.equal(nodes.personalHistoryRows.children[0].children[2].textContent,'2026-10-02');assert.equal(nodes.personalHistoryResult.hidden,false);
 found=false;await nodes.personalHistoryForm.listeners.submit({preventDefault(){}});assert.equal(calls.length,3);assert.equal(nodes.personalHistoryResult.hidden,true);assert.equal(nodes.personalHistoryRows.children.length,0);
});
test('Closing personal history ignores late requests and removes previous personal information',async()=>{
 let resolve;const pending=new Promise(done=>resolve=done);const {nodes,calls}=fixture(true,()=>pending);
 nodes.personalHistoryButton.listeners.click();const task=nodes.personalHistoryForm.listeners.submit({preventDefault(){}});nodes.personalHistoryDialog.close();resolve({data:[{employee_id:7,employee_name:'Name',email:'name@example.com'}],error:null});await task;
 assert.equal(calls.length,1);assert.equal(nodes.personalHistoryRows.children.length,0);assert.equal(nodes.personalHistoryIdentity.textContent,'');assert.equal(nodes.personalHistoryResult.hidden,true);
});

test('Personal history tabs exclude regular and filter hiring and special children by server category metadata and support keyboard navigation',async()=>{
 const {nodes}=fixture(true,async name=>name==='find_employee_identity'?{data:[{employee_id:7,employee_name:'Name',email:'name@example.com'}],error:null}:{data:[
 {root_category_code:'regular',category_name:'정기안전보건교육',title:'Regular',education_date:'2026-10-01'},
 {root_category_code:'hiring',category_name:'채용시교육',title:'Hiring',education_date:'2026-10-02'},
 {root_category_code:'special',category_name:'크레인',title:'Crane',education_date:'2026-10-03'}
 ],error:null});
 nodes.personalHistoryButton.listeners.click();await nodes.personalHistoryForm.listeners.submit({preventDefault(){}});
 assert.equal(nodes.personalHistoryRows.children.length,1);assert.equal(nodes.personalHistoryRows.children[0].children[1].textContent,'Hiring');assert.equal(nodes.personalHistoryCount.textContent,'2');
 nodes['personalHistoryTab-hiring'].listeners.click();assert.equal(nodes.personalHistoryRows.children[0].children[1].textContent,'Hiring');
 nodes['personalHistoryTab-special'].listeners.click();assert.equal(nodes.personalHistoryRows.children[0].children[1].textContent,'Crane');assert.equal(nodes['personalHistoryTab-special'].attributes['aria-selected'],'true');
 nodes['personalHistoryTab-special'].listeners.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(nodes.personalHistoryRows.children[0].children[1].textContent,'Hiring');assert.equal(nodes['personalHistoryTab-hiring'].focused,true);
 nodes.personalHistoryDialog.close();assert.equal(nodes['personalHistoryTab-special'].textContent,'특별교육 0');
});

test('Personal history hides zero-count groups, excludes regular totals, and keyboard navigation skips hidden tabs',async()=>{
 for(const kind of ['hiring','special','regular','empty']){
  const records=kind==='empty'?[]:[{root_category_code:kind,category_name:kind,title:kind,education_date:'2026-10-06'}];
  const {nodes}=fixture(true,async name=>name==='find_employee_identity'?{data:[{employee_id:7,employee_name:'Name',email:'name@example.com'}],error:null}:{data:records,error:null});
  nodes.personalHistoryButton.listeners.click();await nodes.personalHistoryForm.listeners.submit({preventDefault(){}});
  const hasHistory=kind==='hiring'||kind==='special';
  assert.equal(nodes.personalHistoryCount.textContent,hasHistory?'1':'0');
  assert.equal(nodes['personalHistoryTab-hiring'].hidden,kind!=='hiring');
  assert.equal(nodes['personalHistoryTab-special'].hidden,kind!=='special');
  assert.equal(nodes.personalHistoryPanel.hidden,!hasHistory);
  if(hasHistory){const tab=nodes['personalHistoryTab-'+kind];tab.listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(tab.attributes['aria-selected'],'true');assert.equal(nodes.personalHistoryRows.children[0].children[1].textContent,kind);}
  else{assert.equal(nodes.personalHistoryRows.children.length,0);assert.ok(nodes.personalHistoryMessage.textContent);}
 }
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.ok(!html.includes('id="personalHistoryTab-regular"'));
});

test('History uses the education material date, sorts by that date, ignores individual dates and removes status and explanatory text',async()=>{
 const {nodes}=fixture(true,async name=>name==='find_employee_identity'?{data:[{employee_id:7,employee_name:'Name',email:'name@example.com'}],error:null}:{data:[
 {root_category_code:'hiring',title:'Earlier',first_session_date:'2026-09-01',education_date:'2026-12-31',education_date_2:'2027-01-01'},
 {root_category_code:'hiring',title:'Later',conducted_date:'2026-10-01',education_date:'2026-01-01'},
 {root_category_code:'hiring',title:'Undated',education_date:'2026-11-01'}
 ],error:null});
 nodes.personalHistoryButton.listeners.click();await nodes.personalHistoryForm.listeners.submit({preventDefault(){}});
 const rows=nodes.personalHistoryRows.children;assert.equal(rows.length,3);assert.equal(rows[0].children[1].textContent,'Later');assert.equal(rows[0].children[2].textContent,'2026-10-01');assert.equal(rows[1].children[2].textContent,'2026-09-01');assert.equal(rows[2].children[2].textContent,'—');assert.ok(rows.every(row=>row.children.length===3));
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const dialog=html.slice(html.indexOf('<dialog class="personal-history-dialog"'),html.indexOf('<script src="js/personal-history.js">'));
 assert.ok(dialog.includes('>교육일</th>'));assert.ok(!dialog.includes('기록 상태'));assert.ok(!dialog.includes('personalHistoryNotice'));
});
