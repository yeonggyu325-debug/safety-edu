
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function client(initialSession={user:{id:1}}){
 let clock=100000,session=initialSession,activityStatus=200,hidden=false,redirect=null;
 const listeners={},timers=[],calls=[];
 const context=vm.createContext({
  Date:class extends Date{static now(){return clock}},
  db:{auth:{getSession:async()=>({data:{session},error:null})}},
  document:{hidden:false,querySelector:()=>({setAttribute:()=>hidden=true}),addEventListener:(type,fn)=>listeners[type]=fn},
  window:{addEventListener:(type,fn)=>listeners[type]=fn},
  location:{replace:target=>redirect=target},
  setInterval:fn=>timers.push(fn),
  fetch:async(route,options)=>{calls.push({route,options});return {status:activityStatus,ok:activityStatus===200}}
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/session-policy.js'),'utf8'),context);
 return {listeners,timers,calls,advance:ms=>clock+=ms,expire:()=>session=null,denyActivity:()=>activityStatus=401,get hidden(){return hidden},get redirect(){return redirect},flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('Browser polling only checks session; trusted interaction updates activity and expiry hides protected data',async()=>{
 const c=client();await c.flush();
 await c.timers[0]();assert.equal(c.calls.length,0);
 c.advance(30000);
 await c.listeners.pointerdown({isTrusted:false});assert.equal(c.calls.length,0);
 await c.listeners.pointerdown({isTrusted:true});assert.equal(c.calls.length,1);assert.equal(c.calls[0].route,'/api/auth/activity');
 await c.listeners.keydown({isTrusted:true});assert.equal(c.calls.length,1);
 c.expire();await c.timers[0]();
 assert.equal(c.hidden,true);assert.equal(c.redirect,'/');
 c.advance(30000);await c.listeners.input({isTrusted:true});assert.equal(c.calls.length,1);
});
test('Expired activity response returns to login immediately',async()=>{
 const c=client();await c.flush();c.advance(30000);c.denyActivity();
 await c.listeners.scroll({isTrusted:true});assert.equal(c.redirect,'/');assert.equal(c.hidden,true);
});

test('Anonymous readers stay on education and never send admin activity requests',async()=>{
 const c=client(null);await c.flush();await c.timers[0]();c.advance(60000);
 await c.listeners.pointerdown({isTrusted:true});await c.listeners.pageshow();
 assert.equal(c.calls.length,0);assert.equal(c.hidden,false);assert.equal(c.redirect,null);
});
