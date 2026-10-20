
'use strict';
(function sessionPolicy(){
 let expired=false,hadSession=false,sessionActive=false,lastActivitySent=Date.now(),activityPending=false,checking=false;
 function leave(){
  if(expired)return;expired=true;
  document.querySelector('main')?.setAttribute('hidden','');
  location.replace('/');
 }
 async function check(){
  if(expired||checking)return;checking=true;
  try{
   const result=await db.auth.getSession();
   if(!result.error){sessionActive=Boolean(result.data?.session);if(sessionActive)hadSession=true;else if(hadSession)leave();}
  }finally{checking=false}
 }
 async function activity(event){
  if(!sessionActive||!event.isTrusted||document.hidden||expired||activityPending||Date.now()-lastActivitySent<30000)return;
  activityPending=true;
  try{
   const response=await fetch('/api/auth/activity',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
   if(response.status===401)leave();
   else if(response.ok)lastActivitySent=Date.now();
  }catch{}finally{activityPending=false}
 }
 for(const type of ['pointerdown','keydown','input','scroll','pointermove'])document.addEventListener(type,activity,{capture:true,passive:true});
 // This poll checks expiry only; it must never count as user activity.
 setInterval(check,15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
 window.addEventListener('pageshow',check);
 check();
})();
