
'use strict';
const setupForm=document.getElementById('setupForm'),message=document.getElementById('message'),submit=document.getElementById('submitButton');
fetch('/api/status').then(r=>r.json()).then(result=>{if(!result.data?.setupRequired){setupForm.hidden=true;message.textContent='관리자가 이미 등록되어 있습니다.';setupForm.after(message)}}).catch(()=>message.textContent='서버에 연결하지 못했습니다.');
setupForm.addEventListener('submit',async event=>{
 event.preventDefault();if(!setupForm.reportValidity())return;
 if(document.getElementById('password').value!==document.getElementById('confirmPassword').value){message.textContent='비밀번호가 일치하지 않습니다.';return}
 submit.disabled=true;message.textContent='';
 try{
  const response=await fetch('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
  const result=await response.json();
  if(result.error){message.textContent=response.status===403?'서버 PC의 http://127.0.0.1:3000/setup.html에서 등록하세요.':response.status===409?'관리자가 이미 등록되어 있습니다.':result.error.message;return}
  location.assign('/');
 }catch{message.textContent='서버에 연결하지 못했습니다.'}finally{submit.disabled=false}
});
