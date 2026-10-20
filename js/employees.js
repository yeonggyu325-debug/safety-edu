"use strict";
    async function loadEmployeeTab(){
      if(!state.isAdmin)return;
      state.employeeTab="active";
      $("activeEmployeePanel").hidden=false;
      if(!state.employeeRostersLoaded)await loadAllEmployeeRosters();else renderActiveEmployees();
    }
    async function loadAllEmployeeRosters(){
      if(!state.isAdmin)return;
      renderSkeleton("activeEmployeeTableBody",4,6);
      const result=await db.rpc("get_admin_employee_roster",{p_roster:"active"});
      if(result.error){setStatus("activeEmployeeStatus","사원 목록을 불러오지 못했습니다.",true);return;}
      state.activeEmployees=await attachEmployeeEmails(result.data||[]);
      state.retiredEmployees=[];state.employeeTab="active";state.employeeRostersLoaded=true;
      updateEmployeeSummary();renderActiveEmployees();
    }
    async function loadActiveEmployees(){
      renderSkeleton("activeEmployeeTableBody",8,8);
      const {data,error}=await db.rpc("get_admin_employee_roster",{p_roster:"active"});
      if(error){setStatus("activeEmployeeStatus","재직자 명부를 불러오지 못했습니다.",true);return}
      state.activeEmployees=await attachEmployeeEmails(data||[]);updateEmployeeSummary();renderActiveEmployees();fillRetiredDepartmentFilter();
    }
    async function loadRetiredEmployees(){
      renderSkeleton("retiredEmployeeTableBody",8,8);
      const {data,error}=await db.rpc("get_admin_employee_roster",{p_roster:"retired"});
      if(error){setStatus("retiredEmployeeStatus","퇴사자 명부를 불러오지 못했습니다.",true);return}
      state.retiredEmployees=await attachEmployeeEmails(data||[]);updateEmployeeSummary();fillRetiredDepartmentFilter();renderRetiredEmployees();
    }
    async function attachEmployeeEmails(rows){
      const list=[...(rows||[])],ids=[...new Set(list.map(row=>Number(row.employee_id)).filter(Number.isFinite))];
      if(!state.isAdmin||!ids.length)return list;
      const {data,error}=await db.from("employees").select("id,email").in("id",ids);
      if(error){console.warn("[사원 이메일 조회]",error);return list}
      const emailById=new Map((data||[]).map(row=>[Number(row.id),String(row.email||"").trim().toLowerCase()]));
      return list.map(row=>({...row,email:emailById.get(Number(row.employee_id))||""}));
    }
    function updateEmployeeSummary(){
      $("employeeTotal").textContent=state.activeEmployees.length;
      $("employeeActiveTotal").textContent=state.activeEmployees.filter(x=>x.email).length;
    }
    function fillRetiredDepartmentFilter(){const select=$("retiredDepartmentFilter"),current=select.value;select.replaceChildren(new Option("전체 부서",""));state.departments.filter(x=>x.is_active).sort((a,b)=>a.department_name.localeCompare(b.department_name,"ko")).forEach(d=>select.appendChild(new Option(d.department_name,String(d.id))));select.value=current}


    function openHardDeleteForm(employee){
      $("hardDeleteForm").reset();
      $("hardDeleteForce").checked=true;
      $("hardDeleteForce").disabled=true;
      $("hardDeleteEmployeeId").value=employee.employee_id;
      $("hardDeleteEmployeeNameValue").value=employee.employee_name;
      $("hardDeleteEmployeeDisplay").value=employee.employee_name;
      $("hardDeleteError").textContent="";
      openModal("hardDeleteModal");
    }




    function fillEmployeeDepartmentOptions(){}
    function openEmployeeForm(employee=null){
      if($("employeeForm").dataset.saving==="true")return;
      $("employeeForm").reset();$("employeeFormError").textContent="";
      $("employeeId").value=employee?.employee_id||employee?.id||"";
      $("employeeModalTitle").textContent=employee?"사원 정보 수정":"사원 추가";
      $("employeeName").value=employee?.employee_name||"";
      $("employeeEmail").value=String(employee?.email||"").trim().toLowerCase();
      openModal("employeeModal");$("employeeName").focus();
    }
    function toggleEmployeeStatusFields(){}
    async function saveEmployee(event){
      event.preventDefault();const form=$("employeeForm"),errorBox=$("employeeFormError");
      if(form.dataset.saving==="true"||!form.reportValidity())return;
      const submit=form.querySelector('button[type="submit"]'),label=submit.textContent;
      form.dataset.saving="true";submit.disabled=true;submit.textContent="저장 중…";errorBox.textContent="";
      try{
        const result=await db.rpc("save_employee_identity",{
          p_employee_id:$("employeeId").value?Number($("employeeId").value):null,
          p_employee_name:$("employeeName").value.trim(),p_email:$("employeeEmail").value.trim().toLowerCase()
        });
        if(result.error)throw result.error;
        closeModal("employeeModal");showToast("사원 정보가 저장되었습니다.");
        state.employeeRostersLoaded=false;state.monthlyHistoryLoaded=false;await loadAllEmployeeRosters();
      }catch(error){errorBox.textContent=friendlyErrorMessage(error,"사원 정보 저장")}
      finally{delete form.dataset.saving;submit.disabled=false;submit.textContent=label}
    }
    function openRetireForm(ids,label){$("retireForm").reset();$("retireEmployeeIds").value=ids.join(",");$("retireModalTitle").textContent=ids.length===1?`${label} 퇴사 처리`:`선택 ${ids.length}명 퇴사 처리`;$("retirementDateInput").value=new Date().toISOString().slice(0,10);$("retireError").textContent="";openModal("retireModal")}
    async function processRetirement(event){
      event.preventDefault();
      const form=event.currentTarget,submit=form.querySelector('button[type="submit"]');
      const ids=$("retireEmployeeIds").value.split(",").filter(Boolean).map(Number),date=$("retirementDateInput").value,note=$("retirementNote").value.trim()||null;
      $("retireError").textContent="";
      if(!ids.length){$("retireError").textContent="퇴사 처리할 직원을 찾지 못했습니다.";return}
      if(!date){$("retireError").textContent="퇴사일을 입력하세요.";return}
      const scrollX=window.scrollX,scrollY=window.scrollY,originalText=submit?.textContent||"퇴사 처리";
      if(submit){submit.disabled=true;submit.textContent="처리 중"}
      try{
        const results=await Promise.all(ids.map(id=>db.rpc("retire_employee",{p_employee_id:id,p_retirement_date:date,p_note:note})));
        const failed=results.find(result=>result.error);
        if(failed?.error)throw failed.error;
        closeModal("retireModal");
        state.activeEmployeeSelected?.clear?.();
        state.employeeRostersLoaded=false;
        await loadAllEmployeeRosters();
        showToast(`${ids.length}명을 퇴사 처리했습니다.`);
        requestAnimationFrame(()=>window.scrollTo({left:scrollX,top:scrollY,behavior:'auto'}));
      }catch(error){
        console.error("[퇴사 처리]",error);
        $("retireError").textContent=friendlyErrorMessage(error,"퇴사 처리");
      }finally{
        if(submit){submit.disabled=false;submit.textContent=originalText}
      }
    }
    async function openRetiredHistory(employee){
      openModal("retiredHistoryModal");$("retiredHistoryTitle").textContent=`${employee.employee_name} · 교육이력`;renderSkeleton("retiredHistoryTableBody",6,5);setStatus("retiredHistoryStatus","");
      const {data,error}=await db.rpc("get_admin_retired_training_history",{p_employee_id:Number(employee.employee_id)});$("retiredHistoryTableBody").replaceChildren();
      if(error){setStatus("retiredHistoryStatus",friendlyErrorMessage(error,"교육이력 조회"),true);return}if(!data?.length){setStatus("retiredHistoryStatus","등록된 교육이력이 없습니다.");return}renderHistoryRows("retiredHistoryTableBody",data,true);
    }
