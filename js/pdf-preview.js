'use strict';
(function pdfPreview(){
 const table=document.getElementById('educationTableBody'),dialog=document.getElementById('pdfPreviewDialog');
 if(!table||!dialog)return;
 const frame=document.getElementById('pdfPreviewFrame'),title=document.getElementById('pdfPreviewTitle'),notice=document.getElementById('pdfPreviewNotice'),original=document.getElementById('pdfPreviewOriginal');
 const decorated=new WeakSet();let opener=null,previousOverflow='';
 function kind(value){
  try{
   const url=new URL(value,location.href);
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
   const names=[url.pathname,...['filename','file_name','name'].map(key=>url.searchParams.get(key)||'')];
   if(names.some(name=>/\.(xlsx?|csv)(?:$|[?#])/i.test(name)))return 'spreadsheet';
   return names.some(name=>/\.pdf(?:$|[?#])/i.test(name))?'pdf':'link';
  }catch{return null}
 }
 function open(link,button){
  const value=link.getAttribute('href'),type=kind(value);if(!type||type==='spreadsheet')return;
  opener=button;title.textContent=(link.textContent||'자료')+' 미리보기';
  original.setAttribute('href',value);
  notice.textContent=type==='pdf'
   ?'PDF가 표시되지 않거나 다운로드가 시작되면 원본 링크를 열어 확인하세요.'
   :'이 주소는 파일 목록이나 다운로드 페이지일 수 있습니다. PDF가 바로 표시되지 않으면 원본 링크에서 파일을 선택하세요.';
  // Use the saved link as-is: no download, upload, proxy or database update.
  frame.setAttribute('src',value);
  previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  dialog.showModal();
 }
 function decorate(){
  for(const link of table.querySelectorAll('a.download-link')){
   if(decorated.has(link))continue;decorated.add(link);
   const type=kind(link.getAttribute('href'));if(!type||type==='spreadsheet')continue;
   const button=document.createElement('button');button.type='button';button.className='pdf-preview-button';button.textContent='미리보기';
   button.setAttribute('aria-label',(link.textContent||'자료')+' 미리보기');
   button.addEventListener('click',()=>open(link,button));link.after(button);
  }
 }
 document.getElementById('pdfPreviewClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{
  frame.removeAttribute('src');original.removeAttribute('href');
  document.body.style.overflow=previousOverflow;opener?.focus();opener=null;
 });
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();
  if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
 });
 new MutationObserver(decorate).observe(table,{childList:true,subtree:true});
 decorate();
})();
