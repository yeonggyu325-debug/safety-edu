"use strict";
    function fillEducationCategories(){const select=$("educationCategory");select.replaceChildren();state.categories.filter(x=>!state.categories.some(c=>Number(c.parent_id)===Number(x.id))).forEach(x=>{const parent=state.categories.find(c=>Number(c.id)===Number(x.parent_id));select.appendChild(new Option(parent?`${parent.category_name} - ${x.category_name}`:x.category_name,String(x.id)))})}
    function updateEducationFormLayout(){
      const meta=categoryMeta(Number($("educationCategory").value)),regular=meta.type==="regular";
      $("educationTitleField").hidden=false;$("educationTitle").required=true;
      $("educationTopicField").hidden=!regular;$("educationTopic").required=regular;
      $("materialUrlField").hidden=true;$("materialUrl").required=false;
      $("secondDateField").hidden=!regular;$("individualDateRow").hidden=true;
      $("firstDateLabel").textContent=regular?"1차 교육일":"교육일";$("secondDateLabel").textContent="2차 교육일";
      if(!regular)$("secondDate").value="";
      if(!$("educationTitle").value.trim())$("educationTitle").value=meta.label||"";
      window.educationReportDraft?.sync();
    }
    function openEducationForm(item=null){
      if($("educationForm").dataset.saving==="true")return;
      window.resetEducationPdfUploads();$("educationForm").reset();$("educationId").value=item?.id||"";$("educationModalTitle").textContent=item?"교육 수정":"교육 추가";
      $("educationCategory").value=item?.category_id||state.selectedCategoryId||"";
      $("educationTitle").value=item?.title||"";$("educationTopic").value=item?.education_topic||"";
      $("firstDate").value=item?.first_session_date||item?.conducted_date||"";$("secondDate").value=item?.second_session_date||"";
      $("individualStart").value="";$("individualEnd").value="";
      $("materialUrl").value=item?.web_url||"";$("reportUrl").value=item?.result_report_url||"";
      $("educationFormError").textContent="";updateEducationFormLayout();openModal("educationModal");
      window.educationReportDraft.prepare(item);
    }
    async function saveEducation(event){
      event.preventDefault();
      const form=$("educationForm"),errorBox=$("educationFormError");if(form.dataset.saving==="true")return;
      if(!state.isAdmin){errorBox.textContent="관리자만 결과보고서를 저장할 수 있습니다.";return}
      const categoryId=Number($("educationCategory").value),meta=categoryMeta(categoryId),reportFile=$("reportPdf").files?.[0],report=$("reportUrl").value.trim();
      if(!reportFile&&!validUrl(report)){errorBox.textContent="결과보고서 PDF 또는 링크를 등록하세요.";return}
      if(!$("educationTitle").value.trim()){errorBox.textContent="교육명을 입력하세요.";return}
      if(!$("firstDate").value){errorBox.textContent="교육일을 입력하세요.";return}
      let draft;try{draft=window.educationReportDraft.values()}catch(error){errorBox.textContent=error.message;return}
      if(meta.type!=="regular"&&!draft.ids.length){errorBox.textContent="대상자를 1명 이상 선택하세요.";return}
      const id=$("educationId").value,existing=id?state.educationLinks.find(item=>Number(item.id)===Number(id)):null;
      const payload={
        category_id:categoryId,title:$("educationTitle").value.trim(),education_topic:meta.type==="regular"?$("educationTopic").value.trim():null,
        first_session_date:$("firstDate").value,second_session_date:meta.type==="regular"?($("secondDate").value||null):null,result_report_url:report||null
      };
      const controls=[...document.querySelectorAll("#educationModal input,#educationModal select,#educationModal button")].map(node=>({node,disabled:node.disabled}));
      form.dataset.saving="true";errorBox.textContent="";controls.forEach(({node})=>node.disabled=true);
      const submit=form.querySelector('button[type="submit"]'),label=submit.textContent;submit.textContent="저장 중…";
      try{
        if(reportFile){await window.uploadEducationPdf("reportPdf","reportUrl","reportPdfStatus");payload.result_report_url=$("reportUrl").value}
        const result=await db.rpc("save_education_report",{p_id:id?Number(id):null,p_record:payload,p_employee_ids:draft.ids,p_expected_updated_at:existing?.updated_at||null,p_expected_participants:draft.snapshot});
        if(result.error){errorBox.textContent=result.error.code==="EDIT_CONFLICT"?"교육 또는 대상자 정보가 변경되었습니다. 창을 다시 열어 확인하세요.":result.error.message||friendlyErrorMessage(result.error,"저장");return}
        closeModal("educationModal");showToast("등록되었습니다.");await loadPublicData();
      }catch(error){errorBox.textContent=error.name==="TimeoutError"?"업로드 시간이 초과되었습니다. 다시 시도하세요.":error.message||"결과보고서를 저장하지 못했습니다."}
      finally{delete form.dataset.saving;controls.forEach(({node,disabled})=>node.disabled=disabled);submit.textContent=label;$("materialUrl").required=false}
    }
    async function deleteEducation(item){if(!confirm(`"${item.title}" 교육을 삭제하시겠습니까?`))return;const {error}=await db.from("education_links").delete().eq("id",item.id);if(error){showToast(friendlyErrorMessage(error,"요청"));return}showToast("교육이 삭제되었습니다.");await loadPublicData()}

    async function addSelectedParticipants(){
      const ids=[...(state.employeePickerSelected||new Set())].map(Number).filter(Number.isFinite);
      if(!ids.length){showToast("추가할 직원을 선택하세요.");return}
      const button=$("addSelectedParticipantsButton");if(button.disabled)return;const original=button.textContent;
      button.disabled=true;button.textContent="추가 중";let success=0,failed=0;
      try{
        for(let start=0;start<ids.length;start+=15){
          const batch=ids.slice(start,start+15);
          const results=await Promise.all(batch.map(employeeId=>db.rpc("assign_employee_to_education",{p_education_link_id:state.currentEducation.id,p_employee_id:employeeId,p_target_status:"target",p_exclusion_reason:null})));
          results.forEach(result=>result.error?failed++:success++);
        }
        state.employeePickerSelected.clear();await reloadParticipants();
        showToast(failed?`대상자 ${success}명 추가 · ${failed}명 실패`:`선택한 ${success}명을 대상자로 추가했습니다.`);
      }catch(error){showToast(friendlyErrorMessage(error,"대상자 등록"))}
      finally{button.disabled=false;button.textContent=original}
    }
    async function assignAllParticipants(){const {data,error}=await db.rpc("assign_all_current_employees",{p_education_link_id:state.currentEducation.id});if(error){showToast(friendlyErrorMessage(error,"요청"));return}const r=data?.[0]||{};state.employeePickerSelected?.clear();showToast(`전체 등록 ${r.inserted_count||0}명 · 대상자 총 ${r.total_current_employees||0}명`);await reloadParticipants()}
    async function removeParticipant(id,name){if(!confirm(`${name}님을 대상자에서 삭제하시겠습니까?`))return;const {error}=await db.from("education_participants").delete().eq("id",id);if(error){showToast(friendlyErrorMessage(error,"요청"));return}await reloadParticipants();if(categoryMeta(state.currentEducation?.category_id).type==="regular"&&window.syncRegularEducationRange)await window.syncRegularEducationRange(state.currentEducation.id)}
    async function deleteAllParticipants(){if(!state.participants.length)return;if(!confirm(`대상자 ${state.participants.length}명을 모두 삭제하시겠습니까?`))return;const {error}=await db.from("education_participants").delete().eq("education_link_id",state.currentEducation.id);if(error){showToast(friendlyErrorMessage(error,"요청"));return}showToast("대상자를 모두 삭제했습니다.");await reloadParticipants();if(categoryMeta(state.currentEducation?.category_id).type==="regular"&&window.syncRegularEducationRange)await window.syncRegularEducationRange(state.currentEducation.id)}
