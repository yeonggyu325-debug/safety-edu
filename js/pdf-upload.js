'use strict';
(function educationPdfUploads(){
 const maxBytes=50*1024*1024;
 function validate(file){if(!/\.pdf$/i.test(file.name)||!file.size)throw Error('PDF 파일을 선택하세요.');if(file.size>maxBytes)throw Error('PDF는 50MB 이하만 업로드할 수 있습니다.')}
 window.resetEducationPdfUploads=()=>{for(const [id,status] of [['materialPdf','materialPdfStatus'],['reportPdf','reportPdfStatus']]){document.getElementById(id).value='';document.getElementById(status).textContent=''}document.getElementById('materialUrl').required=false};
 window.uploadEducationPdf=async function(id,urlId,statusId){
  if(id!=='reportPdf'||urlId!=='reportUrl'||statusId!=='reportPdfStatus')throw Error('결과보고서 PDF만 업로드할 수 있습니다.');
  const input=document.getElementById(id),status=document.getElementById(statusId),file=input.files?.[0];if(!file)return;
  validate(file);status.textContent='결과보고서 업로드 중…';
  const response=await fetch('/api/files/pdf',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},body:file,signal:AbortSignal.timeout(125000)});
  const result=await response.json();
  if(!response.ok||result.error){
   const messages={AUTH_REQUIRED:'관리자 로그인 시간이 만료되었습니다. 다시 로그인하세요.',FILE_TOO_LARGE:'PDF는 50MB 이하만 업로드할 수 있습니다.',INVALID_PDF:'파일이 올바른 PDF인지 확인하세요.',UPLOAD_BUSY:'다른 파일을 업로드 중입니다. 잠시 후 다시 시도하세요.',STORAGE_FULL:'파일 저장 공간이 부족합니다.'};
   status.textContent='업로드 실패';throw Error(messages[result.error?.code]||'결과보고서를 업로드하지 못했습니다. 다시 시도하세요.');
  }
  document.getElementById(urlId).value=result.data.url;input.value='';status.textContent=result.data.originalName+' · 업로드 완료';
 };
 document.getElementById('reportPdf').addEventListener('change',()=>{
  const input=document.getElementById('reportPdf'),status=document.getElementById('reportPdfStatus'),file=input.files?.[0];status.textContent='';
  if(file)try{validate(file);status.textContent='저장하면 결과보고서와 대상자가 함께 등록됩니다.'}catch(error){status.textContent=error.message;input.value=''}
 });
})();
