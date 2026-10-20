'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element{
 constructor(){this.value='';this.textContent='';this.children=[];this.listeners={};this.hidden=false}
 addEventListener(type,fn){this.listeners[type]=fn}appendChild(node){this.children.push(node)}replaceChildren(){this.children=[]}
 focus(){this.focused=true}reset(){}reportValidity(){return true}showModal(){this.open=true}close(){this.open=false;this.listeners.close()}
 set innerHTML(value){throw Error('Unsafe HTML rendering')}
}
function fixture(fetchImpl){
 const ids=Object.fromEntries(['participantHistoryDialog','participantHistoryForm','participantHistoryName','participantHistorySubmit','participantHistoryResults','participantHistoryMessage','participantHistoryButton','participantHistoryClose','participantSearchForm','participantSearchName','participantSearchMode','participantHistoryMode','participantHistoryTitle','participantHistoryLabel'].map(id=>[id,new Element()]));
 const calls=[];const context=vm.createContext({document:{getElementById:id=>ids[id],createElement:()=>new Element()},AbortController,fetch:async(url,options)=>{calls.push({url,options});return fetchImpl(url,options)},formatDateDot:value=>value,validUrl:value=>typeof value==='string'&&/^https?:|^\/files\//.test(value),addTextCell(tr,text,cls){const td=new Element();td.textContent=text;td.className=cls;tr.appendChild(td)}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/participant-history.js'),'utf8'),context);
 return {ids,calls,mainSearch:()=>ids.participantSearchForm.listeners.submit({preventDefault(){}}),search:()=>ids.participantHistoryForm.listeners.submit({preventDefault(){}})};
}
test('Name-only participant dialog works without auth, separates namesakes, opens reports and clears results on close',async()=>{
 const f=fixture(async()=>({ok:true,json:async()=>({data:{matches:[{name:'Same',match:1,history:[{type:'hiring',category:'Hiring',title:'Report one',education_day:'2026-10-01',report_url:'https://files.example/one.pdf'}]},{name:'Same',match:2,history:[{type:'special',category:'Crane',title:'Report two',education_day:'2026-09-01',report_url:'javascript:bad'}]}]}})}));
 f.ids.participantSearchName.value=' Same ';await f.mainSearch();assert.equal(f.ids.participantHistoryDialog.open,true);
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{name:'Same'});assert.equal(f.calls[0].url,'/api/participants/search');
 const sections=f.ids.participantHistoryResults.children;assert.equal(sections.length,2);assert.ok(sections[0].children[0].textContent.includes('(1)'));assert.ok(sections[1].children[0].textContent.includes('(2)'));
 const row=sections[0].children[1].children[0].children[2].children[0];assert.equal(row.children[1].textContent,'Report one');assert.equal(row.children[2].textContent,'2026-10-01');assert.equal(row.children[3].children[0].href,'https://files.example/one.pdf');
 const other=sections[1].children[1].children[0].children[2].children[0];assert.equal(other.children[3].children.length,0);
 f.ids.participantHistoryClose.listeners.click();assert.equal(f.ids.participantHistoryResults.children.length,0);assert.equal(f.ids.participantHistoryName.value,'');
});
test('Late participant results cannot reappear after closing; a failed request leaves search available',async()=>{
 let resolve;const f=fixture(()=>new Promise(done=>resolve=done));f.ids.participantHistoryName.value='Name';const pending=f.search();
 f.ids.participantHistoryDialog.close();assert.equal(f.calls[0].options.signal.aborted,true);resolve({ok:true,json:async()=>({data:{matches:[{name:'Name',match:1,history:[]}]}})});await pending;
 assert.equal(f.ids.participantHistoryResults.children.length,0);assert.equal(f.ids.participantHistoryResults.hidden,true);
 const failed=fixture(async()=>{throw Error('Failed to fetch')});await failed.search();assert.equal(failed.ids.participantHistorySubmit.disabled,false);assert.ok(failed.ids.participantHistoryMessage.textContent);
});

test('Persistent name search validates blank names, respects IME and resets without filtering education rows',async()=>{
 const f=fixture(async()=>({ok:true,json:async()=>({data:{matches:[]}})}));
 const name=f.ids.participantSearchName;
 name.listeners.compositionstart();name.value='Typing';await f.mainSearch();assert.equal(f.calls.length,0);name.listeners.compositionend();
 name.value='   ';await f.mainSearch();assert.equal(f.calls.length,0);assert.equal(name.focused,true);
 name.value='Name';await f.mainSearch();assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(f.calls[0].options.body),{name:'Name'});
 f.ids.participantSearchForm.listeners.reset();assert.equal(name.value,'');assert.equal(f.ids.participantHistoryDialog.open,false);assert.equal(f.ids.participantHistoryResults.children.length,0);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.ok(!html.includes('id="educationSearch"'));assert.ok(html.indexOf('id="participantSearchForm"')<html.indexOf('<section class="content">'));
});

test('Department search switches controls, renders combined reports and resets to name search',async()=>{
 const f=fixture(async()=>({ok:true,json:async()=>({data:{mode:'department',matches:[{name:'Production',match:1,history:[{category:'Special',title:'Shared report',education_day:'2026-10-01',report_url:'https://files.example/report.pdf'}]}]}})}));
 f.ids.participantSearchMode.value='department';f.ids.participantSearchMode.listeners.change();
 assert.ok(f.ids.participantSearchName.placeholder.includes('부서'));
 f.ids.participantSearchName.value=' Production ';await f.mainSearch();
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{mode:'department',department:'Production'});
 assert.equal(f.ids.participantHistoryMode.value,'department');
 assert.ok(f.ids.participantHistoryTitle.textContent.includes('부서'));
 assert.ok(f.ids.participantHistoryMessage.textContent.includes('1건'));
 assert.equal(f.ids.participantHistoryResults.children.length,1);
 assert.ok(f.ids.participantHistoryResults.children[0].children[0].textContent.includes('관련 자료'));
 f.ids.participantHistoryMode.value='name';f.ids.participantHistoryMode.listeners.change();
 assert.equal(f.ids.participantHistoryResults.children.length,0);assert.equal(f.ids.participantSearchMode.value,'name');
 f.ids.participantHistoryName.value='Person';await f.search();assert.deepEqual(JSON.parse(f.calls[1].options.body),{name:'Person'});
 f.ids.participantSearchForm.listeners.reset();assert.equal(f.ids.participantSearchMode.value,'name');assert.equal(f.ids.participantHistoryDialog.open,false);
});
test('Switching search modes cancels pending responses and never renders results under the wrong mode',async()=>{
 let resolve;const f=fixture(()=>new Promise(done=>resolve=done));
 f.ids.participantSearchName.value='Name';const pending=f.mainSearch();
 f.ids.participantHistoryMode.value='department';f.ids.participantHistoryMode.listeners.change();
 assert.equal(f.calls[0].options.signal.aborted,true);
 resolve({ok:true,json:async()=>({data:{matches:[{name:'Name',history:[]}]}})});await pending;
 assert.equal(f.ids.participantHistoryResults.children.length,0);assert.equal(f.ids.participantHistoryMessage.textContent,'');
});
