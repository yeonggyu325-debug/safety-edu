'use strict';
(function reportRegistration(){
 const node=id=>document.getElementById(id);
 let employees=[],selected=new Set(),snapshot=[],loading=false,failed=false,generation=0;
 function clear(){generation++;employees=[];selected=new Set();snapshot=[];loading=false;failed=false;node('educationTargetList').replaceChildren();node('educationTargetSearch').value='';node('educationTargetStatus').textContent='';}
 function regular(){return categoryMeta(Number(node('educationCategory').value)).type==='regular'}
 function status(){
  const box=node('educationTargetStatus');if(box)box.textContent=loading?'대상자를 불러오는 중입니다.':failed?'대상자를 불러오지 못했습니다. 창을 닫고 다시 열어주세요.':'선택 '+selected.size+'명';
 }
 function render(){
  const list=node('educationTargetList');if(!list)return;list.replaceChildren();
  const query=node('educationTargetSearch').value.trim().toLocaleLowerCase('ko');
  const rows=employees.filter(employee=>!query||[employee.employee_name,employee.email].join(' ').toLocaleLowerCase('ko').includes(query));
  for(const employee of rows){
   const label=document.createElement('label');label.className='education-target-row';
   const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(Number(employee.employee_id));input.disabled=employee.employment_status==='retired';
   const span=document.createElement('span');span.textContent=employee.employee_name;
   const email=document.createElement('small');email.textContent=employee.email||'';span.appendChild(email);
   input.addEventListener('change',()=>{input.checked?selected.add(Number(employee.employee_id)):selected.delete(Number(employee.employee_id));status()});
   label.append(input,span);list.appendChild(label);
  }
  if(!loading&&!failed&&!rows.length){const empty=document.createElement('p');empty.className='status-box';empty.textContent=query?'조회 결과가 없습니다.':'등록된 사원이 없습니다. 사원명부에서 먼저 추가하세요.';list.appendChild(empty)}
  status();
 }
 window.educationReportDraft={
  async prepare(item){
   const version=++generation;employees=[];selected=new Set();snapshot=[];loading=true;failed=false;
   node('educationTargetSearch').value='';render();
   try{
    const results=await Promise.all([db.rpc('get_admin_employee_roster',{p_roster:'active'}),item?db.rpc('get_education_participants',{p_education_link_id:item.id}):Promise.resolve({data:[],error:null})]);
    if(version!==generation)return;
    if(results.some(result=>result.error))throw Error('대상자를 불러오지 못했습니다.');
    employees=results[0].data||[];
    const participants=results[1].data||[];
    snapshot=participants.map(row=>({id:Number(row.participant_id||row.id),updated_at:row.updated_at})).sort((a,b)=>a.id-b.id);
    for(const row of participants)if(row.target_status==='target'){
     selected.add(Number(row.employee_id));
     if(!employees.some(employee=>Number(employee.employee_id)===Number(row.employee_id)))employees.push(row);
    }
   }catch(error){if(version!==generation)return;failed=true}
   finally{if(version===generation){loading=false;render()}}
  },
  values(){if(loading||failed)throw Error(loading?'대상자를 불러온 후 저장하세요.':'대상자를 다시 불러온 후 저장하세요.');return {ids:regular()?[]:[...selected],snapshot}},
  sync(){node('educationTargetsField').hidden=regular();status()}
 };
 db.auth?.onAuthStateChange?.((_event,session)=>{if(!session)clear()});
 const modal=node('educationModal');if(modal&&typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(modal.hidden)clear()}).observe(modal,{attributes:true,attributeFilter:['hidden']});
 node('educationTargetSearch').addEventListener('input',event=>{if(!event.isComposing)render()});
 node('educationTargetSearch').addEventListener('compositionend',render);
 node('educationTargetAll').addEventListener('click',()=>{for(const employee of employees)if(employee.employment_status!=='retired')selected.add(Number(employee.employee_id));render()});
})();
