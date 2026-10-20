'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture({files=false,fail=false,type='regular',ids=[10]}={}){
 const names=['educationForm','educationFormError','educationCategory','educationTitle','educationTopic','materialUrl','reportUrl','firstDate','secondDate','educationId','materialPdf','reportPdf','materialPdfStatus','reportPdfStatus','submit'];
 const nodes=Object.fromEntries(names.map(id=>[id,{value:'',files:[],textContent:'',disabled:false,dataset:{},addEventListener(){}}]));
 nodes.educationCategory.value='1';nodes.educationId.value='7';nodes.educationTitle.value='Title';nodes.educationTopic.value='Topic';nodes.firstDate.value='2026-10-06';
 nodes.materialUrl.value='https://files.example/keep.pdf';nodes.reportUrl.value='https://files.example/report.pdf';
 const source={id:7,web_url:nodes.materialUrl.value,result_report_url:nodes.reportUrl.value,updated_at:'2026-10-06T00:00:00.000Z'};
 if(files){nodes.materialPdf.files=[{name:'material.pdf',size:100}];nodes.reportPdf.files=[{name:'report.pdf',size:100}]}
 nodes.educationForm.querySelector=()=>nodes.submit;nodes.submit.textContent='Save';
 const uploads=[],writes=[];let saved=false;
 const context=vm.createContext({
  document:{getElementById:id=>nodes[id],querySelectorAll:()=>[nodes.materialPdf,nodes.reportPdf,nodes.submit]},
  state:{isAdmin:true,educationLinks:[source]},categoryMeta:()=>({type,label:'Category'}),$:id=>nodes[id],window:{educationReportDraft:{values(){return {ids:type==='regular'?[]:ids,snapshot:[]}}}},validUrl:value=>/^https?:|^\/files\//.test(value),AbortSignal,
  fetch:async(url,options)=>{uploads.push(options);if(fail)return {ok:false,json:async()=>({error:{code:'INVALID_PDF'}})};return {ok:true,json:async()=>({data:{url:'/files/'+'1'.repeat(64)+'.pdf',originalName:options.body.name}})}},
  db:{rpc:async(name,params)=>{writes.push({name,...params});return {data:[{id:7}],error:null}}},closeModal:()=>saved=true,showToast(){},loadPublicData:async()=>{},friendlyErrorMessage:()=> 'Save failed'
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/pdf-upload.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../js/education-editor.js'),'utf8'),context);
 return {context,nodes,uploads,writes,source,get saved(){return saved}};
}
test('Report save preserves source data, only uploads the report and sends selected targets in one RPC after successful upload',async()=>{
 const old=fixture();await old.context.saveEducation({preventDefault(){}});
 assert.equal(old.uploads.length,0);assert.equal(old.writes[0].name,'save_education_report');assert.equal(old.writes[0].p_record.result_report_url,old.source.result_report_url);assert.equal('web_url' in old.writes[0].p_record,false);
 const next=fixture({files:true,type:'special'});await next.context.saveEducation({preventDefault(){}});
 assert.equal(next.uploads.length,1);assert.equal(next.uploads[0].body.name,'report.pdf');assert.match(next.writes[0].p_record.result_report_url,/^\/files\/1{64}\.pdf$/);assert.deepEqual(Array.from(next.writes[0].p_employee_ids),[10]);
 assert.equal(next.saved,true);assert.equal(next.nodes.submit.disabled,false);assert.equal(next.source.web_url,'https://files.example/keep.pdf');
 const failed=fixture({files:true,fail:true});await failed.context.saveEducation({preventDefault(){}});
 assert.equal(failed.writes.length,0);assert.equal(failed.saved,false);assert.ok(failed.nodes.educationFormError.textContent);
 const missing=fixture({type:'special',ids:[]});await missing.context.saveEducation({preventDefault(){}});assert.equal(missing.writes.length,0);
 const report=fixture();report.nodes.reportUrl.value='';await report.context.saveEducation({preventDefault(){}});assert.equal(report.writes.length,0);
});
