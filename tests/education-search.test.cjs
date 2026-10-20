'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('Education browsing keeps category filtering, date order and original reports without keyword search',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/employee-integration.js'),'utf8'),start=source.indexOf('  function categoryChildrenLocal'),end=source.indexOf('  function renderEducationHeaderLocal');
 const categories=[{id:1,category_name:'Special',parent_id:null},{id:2,category_name:'Crane',parent_id:1},{id:3,category_name:'Hiring',parent_id:null}];
 const links=[{id:1,category_id:2,title:'First',first_session_date:'2026-09-01',result_report_url:'https://files.example/first.pdf'},{id:2,category_id:2,title:'Second',first_session_date:'2026-10-01',result_report_url:'https://files.example/second.pdf'},{id:3,category_id:3,title:'Hiring'}];
 const ctx=vm.createContext({state:{categories,educationLinks:links,selectedCategoryId:1},categoryMeta:id=>({type:Number(id)===3?'hiring':'special'})});
 vm.runInContext(source.slice(start,end),ctx);
 assert.deepEqual(Array.from(ctx.educationRowsLocal(),row=>row.id),[2,1]);assert.equal(ctx.educationRowsLocal()[0].result_report_url,'https://files.example/second.pdf');
 ctx.state.selectedCategoryId=3;assert.deepEqual(Array.from(ctx.educationRowsLocal(),row=>row.id),[3]);
});
