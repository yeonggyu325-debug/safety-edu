
'use strict';
const form=document.getElementById('loginPageForm'),message=document.getElementById('message'),button=document.getElementById('submitButton');
if(new URLSearchParams(location.search).get('reason')==='expired')message.textContent='로그인 시간이 만료되었습니다. 다시 로그인하세요.';
fetch('/api/status').then(r=>r.json()).then(result=>{document.getElementById('setupLink').hidden=!result.data?.setupRequired}).catch(()=>{});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity())return;button.disabled=true;message.textContent='';
 try{
  const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
  const result=await response.json();
  if(result.error){message.textContent=result.error.code==='ACCOUNT_LOCKED'?'로그인 실패 3회로 계정이 잠겼습니다. 15분 후 다시 시도하세요.':response.status===401?'이메일 또는 비밀번호를 확인하세요.':'로그인하지 못했습니다. 잠시 후 다시 시도하세요.';return}
  document.getElementById('password').value='';location.replace('/');
 }catch{message.textContent='사내 서버에 연결하지 못했습니다.'}finally{button.disabled=false}
});
