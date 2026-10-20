'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../js/ui-integration.js'),'utf8');
test('Public library still loads when administrator session checks fail',async()=>{
 const start=ui.indexOf('  async function initializePublicLibrary(){'),end=ui.indexOf('  initializePublicLibrary();',start);
 assert.ok(start>=0&&end>start);
 for(const mode of ['error','throw','admin']){
  const calls=[];const session={user:{id:1}};
  const context=vm.createContext({db:{auth:{getSession:async()=>{if(mode==='throw')throw Error('Auth unavailable');return mode==='error'?{error:{message:'Auth unavailable'}}:{data:{session}}}}},console:{warn(){},error(){}},checkAdmin:async value=>calls.push(['role',value]),loadPublicData:async()=>calls.push(['data']),showView:name=>calls.push(['view',name]),setStatus(){throw Error('Unexpected load error')}});
  vm.runInContext(ui.slice(start,end),context);await context.initializePublicLibrary();
  assert.equal(calls[0][1],mode==='admin'?session:null);assert.equal(calls[1][0],'data');assert.equal(calls[2][1],'education');
 }
});
test('Only administrator actions and history require admin login; public search remains present',()=>{
 const start=ui.indexOf('  window.syncAdminUI=function(){'),end=ui.indexOf('  window.attendanceDeleteSelected',start);
 const ids=['adminMenu','personalHistoryButton','loginButton','adminTopActions','logoutButton','addEducationButton'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{hidden:false}]));
 const state={isAdmin:false,isAuthenticated:false,currentView:'education',categories:[]};
 const ctx=vm.createContext({window:{},state,$:id=>nodes[id],showView(){throw Error('Unexpected redirect')}});
 vm.runInContext(ui.slice(start,end),ctx);ctx.window.syncAdminUI();
 assert.equal(nodes.loginButton.hidden,false);for(const id of ids.filter(id=>id!=='loginButton'))assert.equal(nodes[id].hidden,true);
 state.isAdmin=true;state.isAuthenticated=true;ctx.window.syncAdminUI();
 assert.equal(nodes.loginButton.hidden,true);assert.equal(nodes.personalHistoryButton.hidden,false);assert.equal(nodes.adminTopActions.hidden,false);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 for(const id of ['myHistoryOtpModal','loginModal','loginForm'])assert.ok(!html.includes('id="'+id+'"'));
 for(const id of ['participantSearchForm','participantSearchName','participantSearchReset'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(fs.readFileSync(path.join(__dirname,'../login.html'),'utf8').includes('id="loginPageForm"'));
});
