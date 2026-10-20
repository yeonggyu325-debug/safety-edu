'use strict';
(function employeeCsvImport(){
 function parse(text){
  text=String(text).replace(/^\uFEFF/,'');
  const records=[];let row=[],field='',mode='plain',line=1,start=1;
  const push=()=>{row.push(field);field='';mode='plain'};
  const finish=()=>{push();if(row.some(value=>value.trim()))records.push({cells:row,line:start});row=[];start=line+1;};
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(mode==='quoted'){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else mode='after';}else{field+=c;if(c==='\n')line++;}continue;}
   if(c===',' ){push();continue;}
   if(c==='\r'||c==='\n'){finish();if(c==='\r'&&text[i+1]==='\n')i++;line++;continue;}
   if(mode==='after'){if(c===' '||c==='\t')continue;throw Error(line+'행: 따옴표 뒤에 잘못된 문자가 있습니다.');}
   if(c==='"'){if(field.length)throw Error(line+'행: 따옴표 형식을 확인하세요.');mode='quoted';}else field+=c;
  }
  if(mode==='quoted')throw Error(start+'행: 닫히지 않은 따옴표가 있습니다.');
  if(field.length||row.length||mode==='after')finish();
  if(records.length<2)throw Error('헤더와 사원 데이터가 필요합니다.');
  const header=records.shift().cells.map(value=>value.trim().replace(/\s/g,'').toLowerCase());
  const nameIndex=header.findIndex(value=>['사원명','성명','이름','employee_name'].includes(value));
  const emailIndex=header.findIndex(value=>['회사이메일','이메일','email','company_email'].includes(value));
  if(header.length!==2||nameIndex<0||emailIndex<0||nameIndex===emailIndex)throw Error('첫 행은 사원명,회사 이메일 두 열이어야 합니다.');
  if(records.length>5000)throw Error('한 번에 5,000명까지 업로드할 수 있습니다.');
  const seen=new Set();
  return records.map(({cells,line})=>{
   if(cells.length!==2)throw Error(line+'행: 두 열을 입력하세요.');
   const employee_name=cells[nameIndex].trim(),email=cells[emailIndex].trim().toLowerCase();
   if(!employee_name||employee_name.length>100)throw Error(line+'행: 사원명은 1~100자로 입력하세요.');
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error(line+'행: 회사 이메일 형식을 확인하세요.');
   if(seen.has(email))throw Error(line+'행: 파일 안에 중복 이메일이 있습니다.');seen.add(email);
   return {employee_name,email};
  });
 }
 window.employeeCsv={parse};
 const byId=id=>document.getElementById(id),dialog=byId('employeeCsvDialog');
 if(!dialog)return;
 let rows=[],version=0,busy=false;
 const file=byId('employeeCsvFile'),submit=byId('employeeCsvImport'),close=byId('employeeCsvClose'),message=byId('employeeCsvMessage');
 function reset(){version++;rows=[];file.value='';byId('employeeCsvRows').replaceChildren();byId('employeeCsvPreview').hidden=true;submit.disabled=true;message.textContent='';}
 byId('employeeCsvButton').addEventListener('click',()=>{if(!state.isAdmin)return;reset();dialog.showModal();});
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{if(!busy)reset();});
 file.addEventListener('change',async()=>{
  const token=++version;rows=[];submit.disabled=true;message.textContent='';byId('employeeCsvRows').replaceChildren();byId('employeeCsvPreview').hidden=true;
  const selected=file.files?.[0];if(!selected)return;
  try{
   if(!/\.csv$/i.test(selected.name)||selected.size>1024*1024)throw Error('1MB 이하의 CSV 파일을 선택하세요.');
   const bytes=await selected.arrayBuffer();let text;
   try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('euc-kr',{fatal:true}).decode(bytes);}
   if(token!==version)return;rows=parse(text);
   for(const [index,row] of rows.slice(0,20).entries()){const tr=document.createElement('tr');addTextCell(tr,index+1);addTextCell(tr,row.employee_name);addTextCell(tr,row.email);byId('employeeCsvRows').appendChild(tr);}
   byId('employeeCsvPreview').hidden=false;message.textContent=rows.length+'명 확인 완료'+(rows.length>20?' · 미리보기는 첫 20명만 표시합니다.':'');submit.disabled=!state.isAdmin;
  }catch(error){if(token===version){rows=[];message.textContent=error.message;}}
 });
 submit.addEventListener('click',async()=>{
  if(busy||!state.isAdmin||!rows.length)return;busy=true;file.disabled=true;submit.disabled=true;close.disabled=true;submit.textContent='등록 중…';
  try{
   const result=await db.rpc('import_employee_identities_csv',{p_rows:rows});
   if(result.error)throw result.error;
   message.textContent=result.data.created_count+'명 등록 · 기존 사원 '+result.data.skipped_count+'명 건너뜀';
   rows=[];byId('employeeCsvPreview').hidden=true;byId('employeeCsvRows').replaceChildren();file.value='';
   state.employeeRostersLoaded=false;await loadAllEmployeeRosters();showToast(message.textContent);
  }catch(error){message.textContent=error.code==='CSV_IMPORT_CONFLICT'?'기존 사원과 이메일·이름이 충돌합니다. 파일을 수정한 뒤 다시 확인하세요.':friendlyErrorMessage(error,'CSV 사원 등록');}
  finally{busy=false;file.disabled=false;close.disabled=false;submit.disabled=!rows.length||!state.isAdmin;submit.textContent='일괄 등록';}
 });
 byId('employeeCsvTemplate').addEventListener('click',()=>{
  const blob=new Blob(['\uFEFF사원명,회사 이메일\r\n홍길동,hong@company.com\r\n'],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='employee-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
})();
