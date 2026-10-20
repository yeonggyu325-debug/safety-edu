'use strict';
(function publicParticipantHistory(){
 const byId=id=>document.getElementById(id),dialog=byId('participantHistoryDialog'),form=byId('participantHistoryForm'),input=byId('participantHistoryName'),submit=byId('participantHistorySubmit'),results=byId('participantHistoryResults'),message=byId('participantHistoryMessage');
 if(!dialog||!form)return;
 let generation=0,controller=null,activeMode='name';
 const mainMode=byId('participantSearchMode'),dialogMode=byId('participantHistoryMode');
 function setMode(mode){
  activeMode=mode==='department'?'department':'name';
  for(const select of [mainMode,dialogMode])if(select)select.value=activeMode;
  const label=byId('participantHistoryLabel'),title=byId('participantHistoryTitle');
  if(label)label.textContent=activeMode==='department'?'부서명':'참석자 이름';
  if(title)title.textContent=activeMode==='department'?'부서별 결과보고서 검색':'참석자 교육 이력 검색';
  input.placeholder=activeMode==='department'?'부서명 전체 또는 일부를 입력하세요':'이름을 정확히 입력하세요';
  const field=byId('participantSearchName');if(field)field.placeholder=activeMode==='department'?'부서명을 입력하세요':'참석자 이름을 정확히 입력하세요';
 }
 function clear(){results.replaceChildren();results.hidden=true;message.textContent=''}
 function cancel(){generation++;controller?.abort();controller=null;submit.disabled=false;submit.textContent='검색'}
 async function open(name='',mode='name'){cancel();form.reset();setMode(mode);clear();input.value=name;dialog.showModal();if(name)await load();else input.focus()}
 function render(matches){
  if(!matches.length){message.textContent=activeMode==='department'?'조회 결과가 없습니다. 부서명을 확인하세요.':'조회 결과가 없습니다. 이름을 확인하세요.';return}
  const total=matches.reduce((sum,person)=>sum+person.history.length,0);
  message.textContent=activeMode==='department'?'현재 소속 부서 기준 · 결과보고서 '+total+'건':matches.length>1?'같은 이름의 참석자가 '+matches.length+'명입니다. 사람별로 이력을 나누어 표시했습니다.':'교육 이력 '+total+'건';
  for(const person of matches){
   const section=document.createElement('section');section.className='participant-history-person';
   const heading=document.createElement('h3');heading.textContent=person.name+(activeMode==='department'?' 관련 자료':'')+(matches.length>1?' ('+person.match+')':'')+' · '+person.history.length+'건';section.appendChild(heading);
   if(!person.history.length){const empty=document.createElement('p');empty.className='status-box';empty.textContent='등록된 채용시·특별교육 이력이 없습니다.';section.appendChild(empty);results.appendChild(section);continue}
   const wrap=document.createElement('div');wrap.className='table-wrap';
   const table=document.createElement('table'),caption=document.createElement('caption');caption.className='sr-only';caption.textContent=heading.textContent+' 교육 이력';
   const head=document.createElement('thead'),headRow=document.createElement('tr');
   for(const text of ['교육 구분','교육명','교육일','결과보고서']){const th=document.createElement('th');th.scope='col';th.textContent=text;headRow.appendChild(th)}
   head.appendChild(headRow);const body=document.createElement('tbody');
   for(const row of person.history){
    const tr=document.createElement('tr');
    addTextCell(tr,row.category||'교육','history-category');addTextCell(tr,row.title||'—','history-title');
    addTextCell(tr,row.education_day?(formatDateDot(row.education_day)||'—'):'—','history-date');
    const td=document.createElement('td');
    if(validUrl(row.report_url)){
     const link=document.createElement('a');link.className='download-link';link.textContent='결과보고서';link.href=row.report_url;link.target='_blank';link.rel='noopener noreferrer';td.appendChild(link);
    }else td.textContent='미등록';
    tr.appendChild(td);body.appendChild(tr);
   }
   table.appendChild(caption);table.appendChild(head);table.appendChild(body);wrap.appendChild(table);section.appendChild(wrap);results.appendChild(section);
  }
  results.hidden=false;
 }
 const mainForm=byId('participantSearchForm'),mainInput=byId('participantSearchName');
 if(mainForm&&mainInput){
  let composing=false;
  mainInput.addEventListener('compositionstart',()=>{composing=true});
  mainInput.addEventListener('compositionend',()=>{composing=false});
  mainInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&(composing||event.isComposing||event.keyCode===229))event.preventDefault()});
  mainForm.addEventListener('submit',async event=>{
   event.preventDefault();if(composing)return;
   const name=mainInput.value.trim();
   if(!name){mainInput.value='';mainForm.reportValidity();mainInput.focus();return}
   if(!mainForm.reportValidity())return;
   await open(name,mainMode?.value||'name');
  });
  mainForm.addEventListener('reset',()=>{setMode('name');mainInput.value='';cancel();clear();input.value='';if(dialog.open)dialog.close();mainInput.focus()});
  const header=byId('sidebar');
  if(header&&typeof ResizeObserver==='function'&&typeof getComputedStyle==='function'){
   function syncOffset(){const position=getComputedStyle(header).position;mainForm.style.setProperty('--participant-search-top',position==='sticky'||position==='fixed'?header.getBoundingClientRect().height+'px':'0px')}
   new ResizeObserver(syncOffset).observe(header);
   window.addEventListener('resize',syncOffset,{passive:true});syncOffset();
  }
 }

 mainMode?.addEventListener('change',()=>{cancel();clear();if(dialog.open)dialog.close();setMode(mainMode.value);input.value='';if(mainInput){mainInput.value='';mainInput.focus()}});
 dialogMode?.addEventListener('change',()=>{cancel();clear();setMode(dialogMode.value);input.value='';if(mainInput)mainInput.value='';input.focus()});
 setMode('name');
 byId('participantHistoryClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{cancel();clear();input.value=''});
 async function load(event){
  event?.preventDefault();if(!form.reportValidity())return;
  if(mainInput)mainInput.value=input.value.trim();
  cancel();const token=generation;controller=new AbortController();clear();submit.disabled=true;submit.textContent='조회 중…';
  try{
   const response=await fetch('/api/participants/search',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(activeMode==='department'?{mode:'department',department:input.value.trim()}:{name:input.value.trim()}),signal:controller.signal});
   const result=await response.json();if(token!==generation)return;
   if(!response.ok||result.error)throw Error(result.error?.message||'조회하지 못했습니다.');
   render(result.data?.matches||[]);
  }catch(error){if(token===generation&&error.name!=='AbortError')message.textContent=error.message==='Failed to fetch'?'서버에 연결하지 못했습니다. 다시 검색하세요.':error.message||'조회하지 못했습니다. 다시 검색하세요.'}
  finally{if(token===generation){controller=null;submit.disabled=false;submit.textContent='검색'}}
 }
 form.addEventListener('submit',load);
})();
