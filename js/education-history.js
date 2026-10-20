"use strict";
    function categoryMeta(categoryId){
      const category=state.categories.find(x=>Number(x.id)===Number(categoryId));
      const parent=state.categories.find(x=>Number(x.id)===Number(category?.parent_id));
      const full=`${parent?.category_name||""} ${category?.category_name||""}`.replace(/\s+/g,"");
      return {
        category,
        parent,
        label:category?.category_name||parent?.category_name||"교육",
        type:full.includes("특별안전교육")?"special":full.includes("채용시교육")?"hiring":"regular"
      };
    }
    function isSpecialCategory(categoryId){return categoryMeta(categoryId).type==="special"}
    function specialEducationDisplayLabel(value){
      const normalized=normalizedCategoryName(value);
      if(normalized.includes("크레인"))return "1톤 이상의 크레인을 사용하는 작업 또는 1톤 미만의 크레인 또는 호이스트를 5대 이상 보유한 사업자에서 해당 기계로 하는 작업";
      if(normalized.includes("밀폐공간"))return "밀폐공간에서의 작업";
      if(normalized.includes("75V")&&(normalized.includes("활선")||normalized.includes("정전")))return "전압이 75V 이상인 정전 및 활선 작업";
      return value||"-";
    }
    function scheduleText(item){
      const type=categoryMeta(item.category_id).type;
      const lines=[];
      if(type==="hiring"){
        const date=item.first_session_date||item.conducted_date;
        return date?formatDateDot(date):"-";
      }
      if(type==="special"){
        const commonDate=item.first_session_date||item.conducted_date;
        return commonDate?`(공통) ${formatDateDot(commonDate)}`:"-";
      }
      if(item.first_session_date)lines.push(`(1차) ${formatDateDot(item.first_session_date)}`);
      if(item.second_session_date)lines.push(`(2차) ${formatDateDot(item.second_session_date)}`);
      return lines.join("\n")||"-";
    }



    const monthlyExclusionLabels={
      leave:"휴직",overseas:"해외출장",long_trip:"해외출장",china_expat:"중국주재원",
      non_regular:"비상근",retired:"퇴사",new_hire:"신규입사자",other:"기타"
    };
    function monthlyReasonLabel(value){
      const key=String(value||'').trim();
      return monthlyExclusionLabels[key]||statusLabels[key]||key||'비대상';
    }
    function educationLinkMonth(link){
      const value=String(link?.first_session_date||link?.conducted_date||link?.second_session_date||'').slice(0,7);
      return /^\d{4}-\d{2}$/.test(value)?value:'';
    }
    function setEducationPanel(panel){
      const selected=panel==='monthly'?'monthly':'list';state.educationPanel=selected;
      const listTab=$('educationListTab'),monthlyTab=$('educationMonthlyTab'),listPanel=$('educationListPanel'),monthlyPanel=$('educationMonthlyPanel');
      if(!listTab||!monthlyTab)return;
      listTab.classList.toggle('active',selected==='list');monthlyTab.classList.toggle('active',selected==='monthly');
      listTab.setAttribute('aria-selected',String(selected==='list'));monthlyTab.setAttribute('aria-selected',String(selected==='monthly'));
      listTab.tabIndex=selected==='list'?0:-1;monthlyTab.tabIndex=selected==='monthly'?0:-1;
      listPanel.hidden=selected!=='list';monthlyPanel.hidden=selected!=='monthly';
      if(selected==='monthly')loadMonthlyEducationHistory();
    }
    async function loadMonthlyEducationHistory(force=false){
      if(state.monthlyHistoryLoading||(!force&&state.monthlyHistoryLoaded)){renderMonthlyEducationHistory();return}
      state.monthlyHistoryLoading=true;setStatus('monthlyHistoryStatus','월별 교육현황을 불러오는 중입니다.');
      try{
        const regularLinks=(state.educationLinks||[]).filter(link=>categoryMeta(link.category_id).type==='regular'&&educationLinkMonth(link));
        const [employeeResult,retiredResult]=await Promise.all([
          db.rpc('get_current_employees'),
          db.rpc('get_admin_employee_roster',{p_roster:'retired'})
        ]);
        if(employeeResult.error)throw employeeResult.error;
        if(retiredResult.error)console.warn('[월별 교육현황 퇴사자 조회]',retiredResult.error);
        const employeeMap=new Map();
        [...(employeeResult.data||[]),...(retiredResult.data||[])].forEach(employee=>{
          const key=String(employee.employee_id);
          const previous=employeeMap.get(key)||{};
          employeeMap.set(key,{...previous,...employee});
        });
        const employees=[...employeeMap.values()],participantResults=[];
        for(let i=0;i<regularLinks.length;i+=8){
          const batch=regularLinks.slice(i,i+8);
          const results=await Promise.all(batch.map(link=>db.rpc('get_education_participants',{p_education_link_id:Number(link.id)})));
          results.forEach((result,index)=>participantResults.push({link:batch[index],result}));
        }
        const byEmployee=new Map(employees.map(employee=>[String(employee.employee_id),{
          employee_id:employee.employee_id,
          employee_name:employee.employee_name||'-',
          department_name:employee.department_name||'-',
          hire_date:employee.hire_date||employee.employment_date||employee.join_date||null,
          retirement_date:employee.retirement_date||employee.retired_at||null,
          months:new Map()
        }]));
        const monthSet=new Set();
        participantResults.forEach(({link,result})=>{
          if(result.error){console.warn('[월별 교육현황]',result.error);return}
          const month=educationLinkMonth(link);if(!month)return;monthSet.add(month);
          (result.data||[]).forEach(row=>{
            const key=String(row.employee_id);if(!byEmployee.has(key))byEmployee.set(key,{employee_id:row.employee_id,employee_name:row.employee_name||'-',department_name:row.department_name||'-',hire_date:row.hire_date||row.employment_date||row.join_date||null,retirement_date:row.retirement_date||row.retired_at||null,months:new Map()});
            const record=byEmployee.get(key);record.retirement_date=record.retirement_date||row.retirement_date||row.retired_at||null;
            const existing=record.months.get(month)||{dates:new Set(),excluded:false,incomplete:false,reasons:new Set(),linkId:Number(link.id),participantId:row.participant_id||row.id||null,updatedAt:row.updated_at||null}; existing.linkId=Number(link.id); existing.participantId=row.participant_id||row.id||existing.participantId||null; existing.updatedAt=row.updated_at||existing.updatedAt||null;
            const reason=row.exclusion_reason||row.non_target_reason||row.target_reason||'';
            const status=String(row.target_status||'').toLowerCase(),reasonLabel=monthlyReasonLabel(reason||row.target_status);
            const incomplete=reasonLabel==='미수료'||['incomplete','not_completed','uncompleted'].includes(status);
            const excluded=!incomplete&&(Boolean(reason)||['excluded','non_target','not_target'].includes(status));
            if(incomplete){existing.incomplete=true;existing.excluded=false;existing.reasons=new Set(['미수료']);}
            else if(excluded){existing.excluded=true;existing.incomplete=false;existing.reasons.add(reasonLabel);}
            else{
              existing.incomplete=false;
              [row.education_date,row.education_date_2].filter(Boolean).forEach(date=>existing.dates.add(String(date).slice(0,10)));
            }
            record.months.set(month,existing);
          });
        });
        state.monthlyHistoryRows=[...byEmployee.values()].sort((a,b)=>(a.department_name||'').localeCompare(b.department_name||'','ko')||(a.employee_name||'').localeCompare(b.employee_name||'','ko'));
        state.monthlyHistoryMonths=[...monthSet].sort();state.monthlyHistoryLoaded=true;
        syncMonthlyHistoryYearOptions();renderMonthlyEducationHistory();
      }catch(error){console.error('[월별 교육 조회]',error);setStatus('monthlyHistoryStatus',friendlyErrorMessage(error,'월별 교육현황 조회'),true)}
      finally{state.monthlyHistoryLoading=false}
    }
    function syncMonthlyHistoryYearOptions(){
      const select=$('monthlyHistoryYear');if(!select)return;
      const current=select.value,years=[...new Set(state.monthlyHistoryMonths.map(month=>month.slice(0,4)))].sort().reverse();
      select.replaceChildren();years.forEach(year=>select.appendChild(new Option(`${year}년`,year)));
      if(current&&years.includes(current))select.value=current;else if(years.length)select.value=years[0];
    }
    function renderMonthlyEducationHistory(){
      const head=$('monthlyHistoryHead'),body=$('monthlyHistoryBody');if(!head||!body)return;
      head.replaceChildren();body.replaceChildren();
      const year=$('monthlyHistoryYear')?.value||state.monthlyHistoryMonths.at(-1)?.slice(0,4)||'';
      const months=Array.from({length:12},(_,index)=>`${year}-${String(index+1).padStart(2,'0')}`);
      const query=String($('monthlyHistorySearch')?.value||'').trim().toLowerCase();
      const rows=state.monthlyHistoryRows.filter(row=>!query||`${row.department_name} ${row.employee_name}`.toLowerCase().includes(query));
      const headerRow=document.createElement('tr');
      [['사원명','employee-col'],['부서','department-col']].forEach(([label,className])=>{const th=document.createElement('th');th.scope='col';th.className=className;th.textContent=label;headerRow.appendChild(th)});
      months.forEach(month=>{const th=document.createElement('th');th.scope='col';th.textContent=`${Number(month.slice(5))}월`;headerRow.appendChild(th)});head.appendChild(headerRow);
      const fragment=document.createDocumentFragment();
      rows.forEach(row=>{
        const tr=document.createElement('tr');addTextCell(tr,row.employee_name,'employee-col',row.employee_name);addTextCell(tr,row.department_name,'department-col',row.department_name);
        months.forEach(month=>{
          const td=document.createElement('td'),entry=row.months.get(month);
          if(entry?.excluded){td.className='month-excluded';const label=document.createElement('span');label.className='monthly-cell-reason';label.textContent=`비대상(${[...entry.reasons].join(', ')||'사유 미입력'})`;td.appendChild(label);td.title=label.textContent;}
          else if(entry?.dates?.size){td.className='month-attended';[...entry.dates].sort().forEach(date=>{const span=document.createElement('span');span.className='monthly-cell-date';span.textContent=formatDateDot(date,true);td.appendChild(span)});td.title=[...entry.dates].sort().join(', ');}
          else{td.className='month-empty';td.textContent='-';}
          tr.appendChild(td);
        });fragment.appendChild(tr);
      });body.appendChild(fragment);
      setStatus('monthlyHistoryStatus',rows.length?`${year}년 ${rows.length}명 조회`:'조회되는 직원이 없습니다.');
    }

    function showView(name){
      if(name==="attendance")name="education";
      if((name==="employees"||name==="departments")&&!state.isAdmin)name="education";
      if(state.currentView==="attendance"&&name!=="attendance")attendanceUnsubscribeRealtime();
      state.currentView=name;
      $("educationView").hidden=name!=="education";
      $("employeeView").hidden=name!=="employees";
      $("departmentView").hidden=name!=="departments";
      $("attendanceView").hidden=name!=="attendance";
      $("addEducationButton").hidden=!(state.isAdmin&&name==="education");
      const halfYearButton=$("regularHalfYearImportButton");if(halfYearButton)halfYearButton.hidden=!(state.isAdmin&&name==="education"&&categoryMeta(state.selectedCategoryId).type==="regular");
      $("employeeMenuButton").classList.toggle("active",name==="employees");
      $("departmentMenuButton").classList.toggle("active",name==="departments");
      $("attendanceMenuButton")?.classList.toggle("active",false);
      if(name==="education"){
        setEducationPanel(state.educationPanel||"list");
        const selected=state.categories.find(x=>Number(x.id)===Number(state.selectedCategoryId));
        $("pageTitle").textContent=selected?.category_name||"안전교육 자료실";
      }
      if(name==="employees"){$("pageTitle").textContent="사원명부";loadEmployeeTab(state.employeeTab)}
      if(name==="departments"){$("pageTitle").textContent="부서관리";loadDepartments()}
    }
