'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Element{
 constructor(){this.value='';this.children=[];this.events={};this.hidden=false}
 replaceChildren(){this.children=[]}appendChild(node){this.children.push(node)}append(...nodes){this.children.push(...nodes)}addEventListener(name,fn){this.events[name]=fn}
}
test('Target picker blocks saving while loading, keeps existing targets, ignores stale loads and leaves regular education without personal targets',async()=>{
 const ids=Object.fromEntries(['educationCategory','educationTargetStatus','educationTargetList','educationTargetSearch','educationTargetsField','educationTargetAll'].map(id=>[id,new Element()]));
 const roster=[{employee_id:1,employee_name:'One',email:'one@example.com',employment_status:'employed'},{employee_id:2,employee_name:'Two',email:'two@example.com',employment_status:'employed'}];
 let release,delay=false,regular=false,renders=0,authChange;
 const context=vm.createContext({document:{getElementById:id=>ids[id],createElement:()=>new Element()},window:{},state:{educationUnifiedPage:3},categoryMeta:()=>({type:regular?'regular':'special'}),renderEducationTable(){renders++},db:{auth:{onAuthStateChange(fn){authChange=fn}},rpc(name,p){
  if(name==='get_admin_employee_roster')return Promise.resolve({data:roster,error:null});
  if(delay)return new Promise(resolve=>release=()=>resolve({data:[{id:8,employee_id:1,employee_name:'One',target_status:'target',updated_at:'old'}],error:null}));
  return Promise.resolve({data:p.p_education_link_id===2?[{id:9,employee_id:2,employee_name:'Two',target_status:'target',updated_at:'new'}]:[],error:null});
 }}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/report-registration.js'),'utf8'),context);
 const draft=context.window.educationReportDraft;delay=true;const old=draft.prepare({id:1});assert.throws(()=>draft.values());
 delay=false;await draft.prepare({id:2});release();await old;
 assert.deepEqual(Array.from(draft.values().ids),[2]);assert.equal(draft.values().snapshot[0].id,9);
 ids.educationTargetAll.events.click();assert.deepEqual(Array.from(draft.values().ids).sort(),[1,2]);
 regular=true;draft.sync();assert.equal(ids.educationTargetsField.hidden,true);assert.equal(draft.values().ids.length,0);
 authChange('SIGNED_OUT',null);assert.equal(draft.values().snapshot.length,0);assert.equal(ids.educationTargetList.children.length,0);
});
