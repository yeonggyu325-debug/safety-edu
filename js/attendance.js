"use strict";
    const ATTENDANCE_CONFIG={
      lastSessionKey:"attendance_last_session_id",searchKey:"attendance_search",departmentKey:"attendance_department_filter",statusKey:"attendance_status_filter",fallbackRefreshMs:15000
    };
    const ATTENDANCE_POSITION_ORDER=["대표이사","부사장","전무","상무","이사","부장","차장","과장","대리","사원"];
    function attendancePositionRank(v){const i=ATTENDANCE_POSITION_ORDER.indexOf((v||"").trim());return i<0?999:i}
    function attendanceFormatSeoul(value){if(!value)return"-";const d=new Date(value);if(Number.isNaN(d.getTime()))return"-";const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d).reduce((a,p)=>(a[p.type]=p.value,a),{});const hour=parts.hour==="24"?"00":parts.hour;return `${parts.year}.${parts.month}.${parts.day} ${hour}:${parts.minute}`}
    function attendanceFormatTime(value){if(!value)return"-";const d=new Date(value);if(Number.isNaN(d.getTime()))return"-";const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(d).reduce((a,p)=>(a[p.type]=p.value,a),{});return `${parts.hour==="24"?"00":parts.hour}:${parts.minute}`}
    function attendanceDurationText(minutes){const n=Math.max(0,Number(minutes)||0),h=Math.floor(n/60),m=n%60;return h?`${h}시간 ${m}분`:`${m}분`}
    function attendanceNowLocalInput(){const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return d.toISOString().slice(0,16)}
    $("attendanceLogAddForm").onsubmit=attendanceAddLogInterval;
    async function attendanceInitialize(){
      if(!state.isAdmin)return;
      $("attendanceSearch").value=localStorage.getItem(ATTENDANCE_CONFIG.searchKey)||"";
      const selectedId=await attendanceLoadSessions({preferredId:state.attendanceSessionId,autoSelect:true});
      if(selectedId)await attendanceLoadBoard();else attendanceRenderEmpty();
      attendanceSubscribeRealtime();
    }
    function attendanceNormalizeSessions(rows){
      const source=Array.isArray(rows)?rows:[];
      const seen=new Set();
      return source.filter(row=>{
        if(!row||!row.id)return false;
        const id=String(row.id);
        if(seen.has(id))return false;
        seen.add(id);
        return true;
      }).map(row=>({
        id:String(row.id),
        session_name:row.session_name||"",
        session_date:row.session_date||"",
        round_no:Number(row.round_no||1),
        start_at:row.start_at||null,
        end_at:row.end_at||null,
        created_at:row.created_at||null,
        updated_at:row.updated_at||null
      })).sort((a,b)=>String(b.session_date).localeCompare(String(a.session_date))||Number(a.round_no)-Number(b.round_no)||String(b.created_at||"").localeCompare(String(a.created_at||"")));
    }
    function attendanceRenderSessionOptions(preferredId="",autoSelect=true){
      const select=$("attendanceSessionSelect");
      const rows=attendanceNormalizeSessions(state.attendanceSessions);
      state.attendanceSessions=rows;
      select.replaceChildren(new Option("교육 회차 선택",""));
      rows.forEach(row=>{
        const label=`${row.session_date} · ${row.session_name} · ${row.round_no}차`;
        select.appendChild(new Option(label,String(row.id)));
      });
      const stored=localStorage.getItem(ATTENDANCE_CONFIG.lastSessionKey)||"";
      const candidates=[preferredId,state.attendanceSessionId,stored].map(v=>String(v||"")).filter(Boolean);
      let selected=candidates.find(id=>rows.some(row=>String(row.id)===id))||"";
      if(!selected&&autoSelect&&rows.length)selected=String(rows[0].id);
      state.attendanceSessionId=selected;
      select.disabled=rows.length===0;
      select.value=selected;
      if(selected)localStorage.setItem(ATTENDANCE_CONFIG.lastSessionKey,selected);
      else localStorage.removeItem(ATTENDANCE_CONFIG.lastSessionKey);
      attendanceRenderSessionInfo();
      return selected;
    }
    function attendanceUpsertSessionLocal(session){
      if(!session||!session.id)return "";
      const id=String(session.id);
      state.attendanceSessions=attendanceNormalizeSessions([session,...state.attendanceSessions.filter(row=>String(row.id)!==id)]);
      return attendanceRenderSessionOptions(id,true);
    }
    function attendanceParseSessionRows(data){
      if(Array.isArray(data))return data;
      if(typeof data==="string"){
        try{const parsed=JSON.parse(data);return Array.isArray(parsed)?parsed:Array.isArray(parsed?.sessions)?parsed.sessions:[]}catch{return []}
      }
      if(Array.isArray(data?.sessions))return data.sessions;
      return [];
    }
    async function attendanceFetchSessions(){
      const errors=[];
      const rpc=await db.rpc("attendance_get_sessions_admin");
      if(!rpc.error){
        const rows=attendanceParseSessionRows(rpc.data);
        if(rows.length)return {rows,source:"admin-rpc",errors};
      }else errors.push(`회차 RPC: ${rpc.error.message}`);

      const columns="id,session_name,session_date,round_no,start_at,end_at,created_at,updated_at";
      const direct=await db.from("attendance_sessions").select(columns).order("session_date",{ascending:false}).order("round_no",{ascending:true}).order("created_at",{ascending:false});
      if(!direct.error&&Array.isArray(direct.data))return {rows:direct.data,source:"table",errors};
      if(direct.error)errors.push(`테이블 조회: ${direct.error.message}`);

      const legacy=await db.rpc("attendance_list_sessions");
      if(!legacy.error&&Array.isArray(legacy.data))return {rows:legacy.data,source:"legacy-rpc",errors};
      if(legacy.error)errors.push(`기존 RPC: ${legacy.error.message}`);
      return {rows:[],source:"none",errors};
    }
    async function attendanceLoadSessions({preferredId="",autoSelect=true}={}){
      const select=$("attendanceSessionSelect");
      select.disabled=true;
      select.replaceChildren(new Option("교육 회차 불러오는 중",""));
      const result=await attendanceFetchSessions();
      const rows=attendanceNormalizeSessions(result.rows);
      if(rows.length){
        state.attendanceSessions=rows;
        const selected=attendanceRenderSessionOptions(preferredId,autoSelect);
        setStatus("attendanceStatus","");
        return selected;
      }
      if(state.attendanceSessions.length){
        const selected=attendanceRenderSessionOptions(preferredId,autoSelect);
        setStatus("attendanceStatus","회차 목록 재조회에 실패하여 현재 목록을 유지합니다.",true);
        console.error("attendance session reload failed",result.errors);
        return selected;
      }
      state.attendanceSessionId="";
      select.replaceChildren(new Option("등록된 교육 회차가 없습니다",""));
      select.disabled=true;
      attendanceRenderSessionInfo();
      setStatus("attendanceStatus",result.errors.length?"교육 회차를 불러오지 못했습니다.":"등록된 교육 회차가 없습니다.",true);
      console.error("attendance sessions unavailable",result.errors);
      return "";
    }
    function attendanceCurrentSession(){return state.attendanceSessions.find(row=>String(row.id)===String(state.attendanceSessionId))}
    function attendanceRenderSessionInfo(){
      const session=attendanceCurrentSession();
      $("attendanceEditSessionButton").disabled=!session;
      $("attendanceResyncButton").disabled=!session;
      $("attendanceCsvButton").disabled=!session;$("attendanceMissingCsvButton").disabled=!session;
      const box=$("attendanceSessionInfo");
      box.replaceChildren();
      if(!session){const span=document.createElement("span");span.textContent="교육 회차를 선택하세요.";box.appendChild(span);return}
      const strong=document.createElement("strong");strong.textContent=`${session.session_name} · ${session.round_no||1}차`;
      const date=document.createElement("span");date.textContent=session.session_date;
      const time=document.createElement("span");time.textContent=`${attendanceFormatTime(session.start_at)}~${attendanceFormatTime(session.end_at)}`;
      box.append(strong,date,time);
    }
    function attendancePopulateDepartmentFilter(){
      const current=localStorage.getItem(ATTENDANCE_CONFIG.departmentKey)||"";
      const values=[...new Set(state.attendanceBoard.map(x=>x.department_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko"));
      const select=$("attendanceDepartmentFilter");
      select.replaceChildren(new Option("전체 부서",""),...values.map(value=>new Option(value,value)));
      select.value=values.includes(current)?current:"";
      $("attendanceStatusFilter").value=localStorage.getItem(ATTENDANCE_CONFIG.statusKey)||"";
    }
    function attendanceFilteredRows(){
      const q=$("attendanceSearch").value.trim().toLowerCase(),dept=$("attendanceDepartmentFilter").value,status=$("attendanceStatusFilter").value;
      return state.attendanceBoard.filter(row=>{
        if(q&&!`${row.employee_name||""} ${row.department_name||""} ${row.job_title||""}`.toLowerCase().includes(q))return false;
        if(dept&&row.department_name!==dept)return false;
        const hasIn=Number(row.visit_count||0)>0,hasOut=Number(row.closed_visit_count||0)>0;
        if(status==="not_started"&&hasIn)return false;
        if(status==="entered"&&!hasIn)return false;
        if(status==="completed"&&(!hasOut||row.open_visit_id))return false;
        if(status==="missed"&&!row.missed_signature)return false;
        return true;
      });
    }
    function attendanceIntervals(row){return Array.isArray(row?.intervals)?row.intervals.filter(Boolean):[]}
    function attendanceFirstCheckIn(row){return attendanceIntervals(row).find(item=>item.check_in_at)?.check_in_at||null}
    function attendanceLastCheckOut(row){const closed=attendanceIntervals(row).filter(item=>item.check_out_at);return closed.length?closed[closed.length-1].check_out_at:null}
    function attendanceFullLogText(row){return attendanceIntervals(row).map((item,index)=>`${index+1}회 ${attendanceFormatSeoul(item.check_in_at)}~${attendanceFormatSeoul(item.check_out_at)}`).join(" | ")}
    function attendancePageCount(totalRows){
      return Math.max(1,Math.ceil(totalRows/state.attendancePageSize));
    }
    function attendanceCurrentPageRows(){
      const rows=attendanceFilteredRows(),pages=attendancePageCount(rows.length);
      state.attendancePage=Math.min(Math.max(1,state.attendancePage),pages);
      const start=(state.attendancePage-1)*state.attendancePageSize;
      return rows.slice(start,start+state.attendancePageSize);
    }
    function attendanceSetPage(page){
      const pages=attendancePageCount(attendanceFilteredRows().length);
      const next=Math.min(Math.max(1,Number(page)||1),pages);
      if(next===state.attendancePage)return;
      state.attendancePage=next;
      attendanceRenderBoard();
      const card=document.querySelector('#attendanceView .attendance-table-card');
      if(card)card.scrollIntoView({block:'start',behavior:'smooth'});
    }
    function attendanceRow(id){return state.attendanceBoard.find(row=>String(row.employee_id)===String(id))}
    function attendanceToLocalInput(value){
      if(!value)return"";
      const date=new Date(value);if(Number.isNaN(date.getTime()))return"";
      const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(date).reduce((acc,p)=>(acc[p.type]=p.value,acc),{});
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour==="24"?"00":parts.hour}:${parts.minute}`;
    }
    function attendanceLogCurrentRow(){return attendanceRow(state.attendanceLogEmployeeId)}
    function attendanceRenderLogRows(row){
      const body=$("attendanceLogTableBody"),intervals=attendanceIntervals(row);body.replaceChildren();
      if(!intervals.length){body.innerHTML='<tr><td colspan="5" class="attendance-log-empty">기록된 출입 로그가 없습니다.</td></tr>';return}
      intervals.forEach((item,index)=>{
        const tr=document.createElement("tr");tr.dataset.intervalId=String(item.id||"");
        tr.innerHTML=`<td class="center">${index+1}</td><td><span data-log-text="in">${escapeHtml(attendanceFormatSeoul(item.check_in_at))}</span></td><td><span data-log-text="out">${escapeHtml(attendanceFormatSeoul(item.check_out_at))}</span></td><td class="center">${escapeHtml(item.check_out_at?attendanceDurationText(item.duration_minutes):"진행 중")}</td><td><div class="attendance-log-actions"><button class="attendance-log-edit" type="button">수정</button><button class="attendance-log-delete danger" type="button">삭제</button></div></td>`;
        tr.querySelector(".attendance-log-edit").onclick=()=>attendanceBeginLogEdit(tr,item);
        tr.querySelector(".attendance-log-delete").onclick=()=>attendanceDeleteLog(item);
        body.appendChild(tr);
      });
    }
    function attendanceOpenLog(row){
      if(!row)return;
      state.attendanceLogEmployeeId=String(row.employee_id);
      const session=attendanceCurrentSession(),intervals=attendanceIntervals(row);
      $("attendanceLogTitle").textContent=`${row.employee_name||"사원"} 출입 상세 로그`;
      $("attendanceLogMeta").innerHTML=`<span><strong>교육</strong> ${escapeHtml(session?`${session.session_name} ${session.round_no||1}차`:"-")}</span><span><strong>부서</strong> ${escapeHtml(row.department_name||"-")}</span><span><strong>직급</strong> ${escapeHtml(row.job_title||"-")}</span><span><strong>출입</strong> ${intervals.length}회</span>`;
      attendanceRenderLogRows(row);$("attendanceLogTotal").textContent=attendanceDurationText(row.education_minutes);
      $("attendanceLogAddIn").value="09:30";$("attendanceLogAddOut").value="11:30";$("attendanceLogAddError").textContent="";
      openModal("attendanceLogModal");
    }
    function attendanceBeginLogEdit(tr,item){
      if(tr.classList.contains("attendance-log-edit-row"))return;
      tr.classList.add("attendance-log-edit-row");
      const cells=tr.children;
      cells[1].innerHTML=`<input data-edit-field="in" min="09:30" max="11:30" step="60" type="time" value="${attendanceFormatTime(item.check_in_at)==="-"?"":attendanceFormatTime(item.check_in_at)}">`;
      cells[2].innerHTML=`<input data-edit-field="out" min="09:30" max="11:30" step="60" type="time" value="${attendanceFormatTime(item.check_out_at)==="-"?"":attendanceFormatTime(item.check_out_at)}">`;
      cells[4].innerHTML='<div class="attendance-log-actions"><button class="attendance-log-save primary" type="button">저장</button><button class="attendance-log-cancel" type="button">취소</button></div>';
      cells[4].querySelector(".attendance-log-save").onclick=()=>attendanceSaveLogEdit(tr,item);
      cells[4].querySelector(".attendance-log-cancel").onclick=()=>attendanceOpenLog(attendanceLogCurrentRow());
    }
    async function attendanceSaveLogEdit(tr,item){
      const inputIn=tr.querySelector('[data-edit-field="in"]'),inputOut=tr.querySelector('[data-edit-field="out"]');
      if(!inputIn.value){showToast("입실시각을 입력하세요.");return}
      const inMinutes=attendanceTimeToMinutes(inputIn.value),outMinutes=inputOut.value?attendanceTimeToMinutes(inputOut.value):null;
      if(!Number.isFinite(inMinutes)||inMinutes<570||inMinutes>690||inputOut.value&&(!Number.isFinite(outMinutes)||outMinutes<570||outMinutes>690)){showToast("09:30~11:30 사이의 시간만 입력할 수 있습니다.");return}
      if(inputOut.value&&outMinutes<inMinutes){showToast("퇴실시각은 입실시각보다 빠를 수 없습니다.");return}
      const sessionDate=String(attendanceCurrentSession()?.session_date||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)){showToast("교육일자를 확인하세요.");return}
      const checkIn=new Date(`${sessionDate}T${inputIn.value}:00+09:00`).toISOString(),checkOut=inputOut.value?new Date(`${sessionDate}T${inputOut.value}:00+09:00`).toISOString():null;
      tr.classList.add("attendance-row-loading");
      try{
        const {error}=await db.rpc("attendance_update_interval",{p_interval_id:item.id,p_check_in_at:checkIn,p_check_out_at:checkOut});if(error)throw error;
        await attendanceSyncEducationDates(attendanceCurrentSession(),[Number(state.attendanceLogEmployeeId)],sessionDate);
        await attendanceLoadBoard({silent:true});const row=attendanceLogCurrentRow();if(row)attendanceOpenLog(row);showToast("출입 로그를 수정했습니다.");
      }catch(error){console.error("[출입 로그 수정]",error);showToast("요청을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.");tr.classList.remove("attendance-row-loading")}
    }
    async function attendanceAddLogInterval(event){
      event?.preventDefault();
      const row=attendanceLogCurrentRow(),session=attendanceCurrentSession(),errorBox=$("attendanceLogAddError"),button=$("attendanceLogAddButton");
      if(!row||!session){errorBox.textContent="교육 회차와 사원을 확인하세요.";return}
      const inValue=$("attendanceLogAddIn").value,outValue=$("attendanceLogAddOut").value;
      const inMinutes=attendanceTimeToMinutes(inValue),outMinutes=attendanceTimeToMinutes(outValue);
      if(!Number.isFinite(inMinutes)||!Number.isFinite(outMinutes)||inMinutes<570||outMinutes>690||outMinutes<inMinutes){errorBox.textContent="09:30~11:30 범위에서 입실보다 늦은 퇴실시간을 입력하세요.";return}
      if(attendanceIntervals(row).some(item=>!item.check_out_at)){errorBox.textContent="진행 중인 입실 기록을 먼저 완료하거나 삭제하세요.";return}
      const sessionDate=String(session.session_date||"").slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)){errorBox.textContent="교육일자를 확인하세요.";return}
      const checkIn=new Date(`${sessionDate}T${inValue}:00+09:00`).toISOString(),checkOut=new Date(`${sessionDate}T${outValue}:00+09:00`).toISOString();
      errorBox.textContent="";button.disabled=true;button.textContent="추가 중";
      let createdIntervalId=null;
      try{
        // 서버에 전용 추가 RPC가 있으면 우선 사용하고, 없으면 기존 시작/종료 RPC를 연속 호출한다.
        let added=false,lastMissing=null;
        const rpcCandidates=[
          ["attendance_add_interval",{p_session_id:session.id,p_employee_id:Number(row.employee_id),p_check_in_at:checkIn,p_check_out_at:checkOut}],
          ["attendance_create_interval",{p_session_id:session.id,p_employee_id:Number(row.employee_id),p_check_in_at:checkIn,p_check_out_at:checkOut}]
        ];
        for(const [rpcName,params] of rpcCandidates){
          const result=await db.rpc(rpcName,params);
          if(!result.error){added=true;break}
          const missing=result.error.code==="PGRST202"||String(result.error.message||"").includes("Could not find the function");
          if(!missing)throw result.error;
          lastMissing=result.error;
        }
        if(!added){
          const startResult=await db.rpc("bulk_start_attendance",{p_session_id:session.id,p_employee_ids:[Number(row.employee_id)],p_recorded_at:checkIn});
          if(startResult.error)throw startResult.error;
          const afterStart=await attendanceFetchBoardForSession(session.id),startedRow=afterStart.find(item=>String(item.employee_id)===String(row.employee_id));
          const open=[...attendanceIntervals(startedRow)].reverse().find(item=>!item.check_out_at&&String(item.check_in_at||"").slice(0,16)===String(checkIn).slice(0,16))||[...attendanceIntervals(startedRow)].reverse().find(item=>!item.check_out_at);
          if(!open)throw new Error("추가 입실 기록이 생성되지 않았습니다. 서버 출결 RPC의 다중 출입 허용 여부를 확인하세요.");
          createdIntervalId=open.id||null;
          const endResult=await db.rpc("bulk_end_attendance",{p_session_id:session.id,p_employee_ids:[Number(row.employee_id)],p_recorded_at:checkOut});
          if(endResult.error)throw endResult.error;
        }
        await attendanceSyncEducationDates(session,[Number(row.employee_id)],sessionDate);
        const refreshedRows=await attendanceFetchBoardForSession(session.id);
        const refreshed=refreshedRows.find(item=>String(item.employee_id)===String(row.employee_id));
        if(refreshed){
          const index=state.attendanceBoard.findIndex(item=>String(item.employee_id)===String(row.employee_id));
          if(index>=0)state.attendanceBoard[index]=refreshed;else state.attendanceBoard.push(refreshed);
          attendanceOpenLog(refreshed);
        }
        attendanceLoadBoard({silent:true}).catch(error=>console.warn("[출입 로그 추가] 명단 갱신 실패",error));
        showToast("출입 기록을 추가했습니다.");
      }catch(error){
        console.error("[출입 로그 추가]",error);
        if(createdIntervalId){try{await db.rpc("attendance_delete_interval",{p_interval_id:createdIntervalId})}catch(_){}}
        errorBox.textContent=error?.message||"출입 기록을 추가하지 못했습니다.";
      }finally{button.disabled=false;button.textContent="출입기록 추가"}
    }
    async function attendanceDeleteLog(item){
      if(!confirm("선택한 출입 로그를 삭제하시겠습니까?"))return;
      try{
        const {error}=await db.rpc("attendance_delete_interval",{p_interval_id:item.id});if(error)throw error;
        await attendanceLoadBoard({silent:true});const row=attendanceLogCurrentRow();if(row)attendanceOpenLog(row);showToast("출입 로그를 삭제했습니다.");
      }catch(error){console.error("[출입 로그 삭제]",error);showToast("요청을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.")}
    }
    async function attendanceToggleMissed(employeeId){
      const row=attendanceRow(employeeId);
      if(!row||!state.attendanceSessionId)return;
      const target=!Boolean(row.missed_signature),id=Number(employeeId);
      state.attendanceLoadingRows.add(String(employeeId));
      attendanceRenderBoard();
      try{
        let saved=false,lastError=null;
        for(const rpcName of ["attendance_set_missed_signature","set_attendance_missed_signature","update_attendance_missed_signature"]){
          const result=await db.rpc(rpcName,{p_session_id:state.attendanceSessionId,p_employee_id:id,p_missed_signature:target});
          if(!result.error){saved=true;break}
          lastError=result.error;
          const missing=result.error.code==="PGRST202"||String(result.error.message||"").includes("Could not find the function");
          if(!missing)break;
        }
        if(!saved){
          const existing=await db.from("attendance_records").select("id").eq("session_id",state.attendanceSessionId).eq("employee_id",id).maybeSingle();
          if(existing.error)throw existing.error;
          if(existing.data?.id){
            const updated=await db.from("attendance_records").update({missed_signature:target,updated_at:new Date().toISOString()}).eq("id",existing.data.id);
            if(updated.error)throw updated.error;
          }else{
            const employee=await db.from("employees").select("employee_code,employee_name,job_title").eq("id",id).single();
            if(employee.error)throw employee.error;
            const inserted=await db.from("attendance_records").insert({
              session_id:state.attendanceSessionId,
              employee_id:id,
              employee_no_snapshot:employee.data.employee_code||`EMP-${id}`,
              employee_name_snapshot:employee.data.employee_name||row.employee_name||"",
              department_snapshot:row.department_name||null,
              position_snapshot:employee.data.job_title||row.job_title||null,
              missed_signature:target
            });
            if(inserted.error){
              const retry=await db.from("attendance_records").update({missed_signature:target,updated_at:new Date().toISOString()}).eq("session_id",state.attendanceSessionId).eq("employee_id",id);
              if(retry.error)throw inserted.error;
            }
          }
          if(lastError)console.info("미수강 서명 전용 RPC 미설치로 관리자 RLS 직접 저장 사용",lastError);
        }
        row.missed_signature=target;
        showToast(target?"미수강 서명으로 표시했습니다.":"미수강 서명을 해제했습니다.");
      }catch(error){
        console.error("[미수강 서명 저장]",error);
        showToast("요청을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.");
      }finally{
        state.attendanceLoadingRows.delete(String(employeeId));
        attendanceRenderBoard();
      }
    }
    function attendanceAutoSessionName(dateValue){const month=Number(String(dateValue||"").slice(5,7));return month?`${month}월 정기안전보건교육`:""}
    function attendanceNowTime(){return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date()).replace("24:","00:")}
    function attendanceTimeToMinutes(value){const [h,m]=String(value||"").split(":").map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:NaN}
    function attendanceMinutesToTime(value){const minutes=((Number(value)||0)%1440+1440)%1440;return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`}
    function attendanceDefaultEndTime(startValue){const start=attendanceTimeToMinutes(startValue);return Number.isFinite(start)?attendanceMinutesToTime(Math.min(start+120,1439)):"11:30"}
    function attendanceSyncSessionTimes(){const start=$("attendanceSessionStart").value,end=$("attendanceSessionEnd").value;if(!start)return;const startMin=attendanceTimeToMinutes(start),endMin=attendanceTimeToMinutes(end);if(!Number.isFinite(endMin)||endMin<=startMin)$("attendanceSessionEnd").value=attendanceDefaultEndTime(start)}
    function attendanceBulkDefaultTime(action){
      return action==="bulk_start"?"09:30":"11:30";
    }
    async function attendanceRunIndividual(action,row){
      if(!row||!state.attendanceSessionId)return;
      const employeeId=String(row.employee_id);
      if(state.attendanceLoadingRows.has(employeeId))return;
      state.attendanceLoadingRows.add(employeeId);
      attendanceRenderBoard();
      try{
        const result=await db.rpc(action==="check_in"?"check_in_attendance_v2":"check_out_attendance_v2",{
          p_session_id:state.attendanceSessionId,
          p_employee_id:Number(row.employee_id)
        });
        if(result.error){
          console.error("[개별 출결 처리]",result.error);
          showToast("요청을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.");
          return;
        }
        if(action==="check_in")await attendanceSyncEducationDates(attendanceCurrentSession(),[Number(row.employee_id)]);
        showToast(action==="check_in"?"입실시각을 기록했습니다.":"퇴실시각을 기록했습니다.");
        await attendanceLoadBoard({silent:true});
      }finally{
        state.attendanceLoadingRows.delete(employeeId);
        attendanceRenderBoard();
      }
    }
    function attendanceOpenConfirm(action,rows){
      if(!rows.length)return;
      state.attendanceConfirmAction=action;
      state.attendanceConfirmEmployeeIds=rows.map(x=>Number(x.employee_id));
      $("attendanceConfirmTitle").textContent=action==="bulk_start"?"시작체크":"종료체크";
      $("attendanceConfirmSummary").textContent=`${attendanceCurrentSession()?.session_name||"교육"} · ${rows.length}명`;
      $("attendanceConfirmList").innerHTML=rows.map(x=>`<div class="attendance-confirm-item">${escapeHtml(x.department_name||"-")} / ${escapeHtml(x.job_title||"-")} / ${escapeHtml(x.employee_name)}</div>`).join("");
      $("attendanceBulkTimeField").hidden=false;
      $("attendanceBulkTime").value=attendanceBulkDefaultTime(action);
      $("attendanceBulkTime").readOnly=action==="bulk_start";
      $("attendanceConfirmError").textContent="";
      openModal("attendanceConfirmModal");
    }
    async function attendanceSubmitConfirm(){
      const action=state.attendanceConfirmAction,ids=state.attendanceConfirmEmployeeIds;
      if(!action||!ids.length)return;
      $("attendanceConfirmSubmit").disabled=true;
      ids.forEach(id=>state.attendanceLoadingRows.add(String(id)));
      try{
        const raw=$("attendanceBulkTime").value;
        if(!raw){$("attendanceConfirmError").textContent="기록시각을 입력하세요.";return}
        const minutes=attendanceTimeToMinutes(raw);
        if(!Number.isFinite(minutes)||minutes<570||minutes>690){$("attendanceConfirmError").textContent="09:30~11:30 사이의 시간만 입력할 수 있습니다.";return}
        const session=attendanceCurrentSession();
        const sessionDate=String(session?.session_date||"").slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)){$("attendanceConfirmError").textContent="교육일자를 확인하세요.";return}
        const iso=new Date(`${sessionDate}T${raw}:00+09:00`).toISOString();
        const result=await db.rpc(action==="bulk_start"?"bulk_start_attendance":"bulk_end_attendance",{
          p_session_id:state.attendanceSessionId,
          p_employee_ids:ids,
          p_recorded_at:iso
        });
        if(result.error){
          console.error("[일괄 출결 처리]",result.error);
          $("attendanceConfirmError").textContent="요청을 완료하지 못했습니다. 다시 시도하세요.";
          return;
        }
        if(action==="bulk_start")await attendanceSyncEducationDates(attendanceCurrentSession(),ids,String(attendanceCurrentSession()?.session_date||'').slice(0,10));
        closeModal("attendanceConfirmModal");
        state.attendanceSelected.clear();
        const data=result.data||{};
        showToast(`성공 ${(data.success||[]).length}명 · 건너뜀 ${(data.skipped||[]).length}명 · 실패 ${(data.failed||[]).length}명`);
        await attendanceLoadBoard({silent:true});
      }finally{
        ids.forEach(id=>state.attendanceLoadingRows.delete(String(id)));
        $("attendanceConfirmSubmit").disabled=false;
        attendanceRenderBoard();
      }
    }
    async function attendanceSaveMemoInline(input){
      const row=attendanceRow(input.dataset.employeeId),value=input.value.trim();
      if(!row||String(row.memo||"")===value)return;
      input.disabled=true;
      try{
        const {error}=await db.rpc("update_attendance_memo_v2",{p_session_id:state.attendanceSessionId,p_employee_id:Number(input.dataset.employeeId),p_memo:value||null});
        if(error)throw error;
        row.memo=value;
      }catch(error){
        console.error("[출결 비고 저장]",error);
        input.value=row.memo||"";
        showToast("요청을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.");
      }finally{input.disabled=false}
    }
    function attendanceClearSelection(showMessage=true){
      state.attendanceSelected.clear();
      const selectAll=$("attendanceSelectAll");
      selectAll.checked=false;selectAll.indeterminate=false;
      document.querySelectorAll(".attendance-row-check").forEach(input=>{input.checked=false});
      attendanceUpdateSelection();
      if(showMessage)showToast("선택을 초기화했습니다.");
    }
    function attendanceBulkRows(){return state.attendanceBoard.filter(x=>state.attendanceSelected.has(String(x.employee_id)))}
    function attendanceDownloadCsv(){
      const session=attendanceCurrentSession();
      if(!session)return;
      const csvRows=[["부서","직급","성명","최초입실","최종퇴실","교육인정시간(분)","출입횟수","전체출입기록","미수강 서명","비고"]];
      for(const row of attendanceFilteredRows()){
        const intervals=attendanceIntervals(row);
        csvRows.push([
          row.department_name||"",row.job_title||"",row.employee_name||"",
          attendanceFormatSeoul(attendanceFirstCheckIn(row)),attendanceFormatSeoul(attendanceLastCheckOut(row)),
          row.education_minutes||0,intervals.length,attendanceFullLogText(row),row.missed_signature?"미수강":"정상",row.memo||""
        ]);
      }
      const csv='\ufeff'+csvRows.map(values=>values.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
      const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");
      anchor.href=url;anchor.download=`${session.session_date}_${session.session_name}_${session.round_no||1}차_출결.csv`;anchor.click();URL.revokeObjectURL(url);
    }
    async function attendanceFetchBoardForSession(sessionId){
      const {data,error}=await db.rpc('attendance_get_board',{p_session_id:sessionId});
      if(error)throw error;
      return (Array.isArray(data)?data:[]).sort((a,b)=>(a.department_name||"").localeCompare(b.department_name||"","ko")||(a.employee_name||"").localeCompare(b.employee_name||"","ko"));
    }
    async function attendanceEnsureEducationCatalog(){
      if((state.categories||[]).length&&(state.educationLinks||[]).length)return;
      const [categoriesResult,linksResult]=await Promise.all([
        db.from("education_categories").select("id,category_code,category_name,parent_id,display_order,is_active").eq("is_active",true).order("display_order").order("id"),
        db.from("education_links").select("*").order("first_session_date",{ascending:false,nullsFirst:false}).order("updated_at",{ascending:false})
      ]);
      if(categoriesResult.error)throw categoriesResult.error;
      if(linksResult.error)throw linksResult.error;
      state.categories=(categoriesResult.data||[]).slice().sort((a,b)=>Number(a.display_order||0)-Number(b.display_order||0)||Number(a.id||0)-Number(b.id||0));
      state.educationLinks=linksResult.data||[];
    }
    async function attendanceRegularEducationLink(session){
      const date=String(session?.session_date||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
      await attendanceEnsureEducationCatalog();
      const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
      const linkYear=link=>Number(link?.applicable_year||String(link?.first_session_date||link?.conducted_date||'').slice(0,4))||0;
      const linkMonth=link=>{const titleMatch=String(link?.title||'').match(/(?:^|\D)(1[0-2]|[1-9])\s*월/);if(titleMatch)return Number(titleMatch[1]);const value=String(link?.first_session_date||link?.conducted_date||'');return /^\d{4}-(\d{2})-/.test(value)?Number(value.slice(5,7)):0};
      const candidates=(state.educationLinks||[]).filter(link=>categoryMeta(link.category_id).type==='regular'&&linkYear(link)===year&&linkMonth(link)===month);
      if(!candidates.length)return null;
      if(candidates.length===1)return candidates[0];
      const sessionName=normalizedCategoryName(session?.session_name||'');
      const exact=candidates.filter(link=>{const title=normalizedCategoryName(link.title||'');return sessionName&&title&&(title.includes(sessionName)||sessionName.includes(title))});
      if(exact.length)return exact.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0];
      const sameDate=candidates.filter(link=>[link.first_session_date,link.second_session_date,link.conducted_date].some(value=>String(value||'').slice(0,10)===date));
      if(sameDate.length)return sameDate.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0];
      return candidates.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0];
    }
    async function attendanceSyncEducationDates(session,employeeIds,educationDate){
      const ids=[...new Set((employeeIds||[]).map(Number).filter(Number.isFinite))];
      const date=String(educationDate||session?.session_date||'').slice(0,10);
      if(!ids.length||!/^\d{4}-\d{2}-\d{2}$/.test(date))return {linked:false,updated:0,failed:ids.length};
      try{
        const link=await attendanceRegularEducationLink(session);
        if(!link){console.warn('[교육 출결 연동] 해당 연월의 정기안전보건교육 자료가 없습니다.',session);return {linked:false,updated:0,failed:ids.length}}
        // 출석이 확인된 직원은 기존 비대상 상태를 해제하고 대상자로 통일한다.
        let assignFailed=0;
        for(let start=0;start<ids.length;start+=12){
          const batch=ids.slice(start,start+12);
          const results=await Promise.all(batch.map(employeeId=>db.rpc('assign_employee_to_education',{p_education_link_id:Number(link.id),p_employee_id:Number(employeeId),p_target_status:'target',p_exclusion_reason:null})));
          results.forEach(result=>{if(result.error)assignFailed++});
        }
        let result=await db.rpc('get_education_participants',{p_education_link_id:Number(link.id)});
        if(result.error)throw result.error;
        const byEmployee=new Map((result.data||[]).map(row=>[String(row.employee_id),row]));
        const targetRows=ids.map(id=>byEmployee.get(String(id))).filter(Boolean);
        if(!targetRows.length)return {linked:true,updated:0,failed:ids.length};
        let updated=0,saveFailed=0;
        const participantIds=targetRows.map(row=>Number(row.participant_id||row.id)).filter(Number.isFinite);
        if(participantIds.length){
          const bulk=await db.rpc('bulk_update_education_participant_dates',{p_education_link_id:Number(link.id),p_participant_ids:participantIds,p_education_date:date});
          if(!bulk.error)updated=Array.isArray(bulk.data)&&bulk.data.length?bulk.data.length:participantIds.length;
          else{
            const results=await Promise.all(targetRows.map(row=>db.rpc('update_education_participant_date',{p_education_link_id:Number(link.id),p_participant_id:Number(row.participant_id||row.id),p_education_date:date,p_expected_updated_at:row.updated_at||null})));
            results.forEach(item=>item.error?saveFailed++:updated++);
          }
        }
        state.monthlyHistoryLoaded=false;state.monthlyHistoryRows=[];state.monthlyHistoryMonths=[];
        if(state.educationPanel==='monthly')await loadMonthlyEducationHistory(true);
        if(window.syncRegularEducationRange)window.syncRegularEducationRange(link.id).catch(error=>console.warn('[교육 출결 연동] 교육기간 갱신 실패',error));
        const failed=saveFailed+assignFailed;
        if(failed)console.warn(`[교육 출결 연동] ${failed}명 반영 실패`);
        return {linked:true,updated,failed};
      }catch(error){console.warn('[교육 출결 연동] 교육 참석일 자동 반영 실패',error);return {linked:false,updated:0,failed:ids.length,error}}
    }
    async function attendanceResyncExistingRecords(){
      const session=attendanceCurrentSession();
      if(!session){showToast('교육 회차를 선택하세요.');return}
      const button=$("attendanceResyncButton"),original=button.textContent;
      button.disabled=true;button.textContent='동기화 중';
      try{
        const rows=await attendanceFetchBoardForSession(session.id);
        const ids=[...new Set(rows.filter(row=>{
          const intervals=attendanceIntervals(row);
          return Number(row.visit_count||0)>0||intervals.some(item=>Boolean(item?.check_in_at));
        }).map(row=>Number(row.employee_id)).filter(Number.isFinite))];
        if(!ids.length){showToast('선택한 회차에 동기화할 기존 입실기록이 없습니다.');return}
        const result=await attendanceSyncEducationDates(session,ids,String(session.session_date||'').slice(0,10));
        if(!result?.linked){showToast('해당 월의 정기안전보건교육 자료를 찾지 못해 동기화하지 못했습니다.');return}
        const updated=Number(result.updated||0),failed=Number(result.failed||0);
        showToast(failed?`기존 기록 ${updated}명 동기화 · ${failed}명 실패`:`기존 출결 ${updated}명을 월별 참석조회에 반영했습니다.`);
      }catch(error){
        console.error('[기존 출결 월별 동기화]',error);
        showToast(error?.message||'기존 출결기록을 동기화하지 못했습니다.');
      }finally{
        button.textContent=original;
        button.disabled=!attendanceCurrentSession();
      }
    }

    function attendanceMonthKey(session){return String(session?.session_date||'').slice(0,7)}
    async function attendanceDownloadMissingCsv(){
      const current=attendanceCurrentSession();
      if(!current){showToast('교육 회차를 선택하세요.');return}
      const monthKey=attendanceMonthKey(current),sameGroup=state.attendanceSessions.filter(session=>attendanceMonthKey(session)===monthKey&&String(session.session_name||'')===String(current.session_name||''));
      const first=sameGroup.find(session=>Number(session.round_no)===1),second=sameGroup.find(session=>Number(session.round_no)===2);
      if(!first||!second){showToast('같은 월의 1차·2차 교육 회차가 모두 필요합니다.');return}
      const button=$("attendanceMissingCsvButton"),original=button.textContent;
      button.disabled=true;button.textContent='생성 중';
      try{
        const [firstBoard,secondBoard]=await Promise.all([attendanceFetchBoardForSession(first.id),attendanceFetchBoardForSession(second.id)]);
        const secondMap=new Map(secondBoard.map(row=>[String(row.employee_id),row]));
        const missing=firstBoard.filter(row=>{
          const firstAttended=Number(row.visit_count||0)>0;
          const secondRow=secondMap.get(String(row.employee_id));
          const secondAttended=Number(secondRow?.visit_count||0)>0;
          return !firstAttended&&!secondAttended;
        }).sort((a,b)=>(a.department_name||"").localeCompare(b.department_name||"","ko")||(a.employee_name||"").localeCompare(b.employee_name||"","ko"));
        const rows=[["부서","성명"]];
        missing.forEach(row=>rows.push([row.department_name||'',row.employee_name||'']));
        const csv='\ufeff'+rows.map(values=>values.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
        const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
        anchor.href=url;anchor.download=`${monthKey}_${current.session_name}_1차2차_미실시자_${missing.length}명.csv`;anchor.click();URL.revokeObjectURL(url);
        showToast(`1·2차 미실시자 ${missing.length}명의 CSV를 만들었습니다.`);
      }catch(error){
        console.error('[1·2차 미실시자 CSV]',error);
        showToast('요청을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.');
      }finally{button.disabled=!attendanceCurrentSession();button.textContent=original}
    }
    function attendanceUnsubscribeRealtime(){if(state.attendanceChannel){db.removeChannel(state.attendanceChannel);state.attendanceChannel=null}attendanceStopPolling()}
    function attendanceStartPolling(){if(state.attendancePollTimer)return;state.attendancePollTimer=setInterval(()=>{if(state.currentView==="attendance"&&state.attendanceSessionId)attendanceLoadBoard({silent:true})},ATTENDANCE_CONFIG.fallbackRefreshMs)}
    function attendanceStopPolling(){if(state.attendancePollTimer){clearInterval(state.attendancePollTimer);state.attendancePollTimer=null}}
