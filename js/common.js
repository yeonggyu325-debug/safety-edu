"use strict";
    const state={
      isAdmin:false,currentView:"education",employeeTab:"active",
      categories:[],educationLinks:[],departments:[],departmentCounts:[],
      activeEmployees:[],retiredEmployees:[],currentEducation:null,
      currentEmployees:[],participants:[],employeeRostersLoaded:false,
      attendanceSessions:[],attendanceBoard:[],attendanceSessionId:localStorage.getItem("attendance_last_session_id")||"",
      attendanceSelected:new Set(),attendanceChannel:null,attendancePollTimer:null,attendanceLoadingRows:new Set(),attendanceLogEmployeeId:null,
      attendanceConfirmAction:null,attendanceConfirmEmployeeIds:[],attendanceLocalMutationUntil:0,attendancePage:1,attendancePageSize:50,
      currentEmployeeTotal:null,educationParticipantCounts:new Map(),educationIndividualRanges:new Map(),participantSecondDateSupport:"unknown",
      selfHistoryRows:[],selfHistoryHalfIndex:-1,
      educationPanel:"list",monthlyHistoryRows:[],monthlyHistoryMonths:[],monthlyHistoryLoaded:false,monthlyHistoryLoading:false,monthlyHistoryPage:1
    };
    const $=id=>document.getElementById(id);
    function escapeHtml(value){
      return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    }
    const statusLabels={employed:"재직",china_expat:"중국주재원",leave:"휴직",retired:"퇴사",non_regular:"비상근",long_trip:"해외출장"};

    function debounce(fn,delay=180){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay)}}
    function formatDate(value){if(!value)return"-";const d=new Date(value+"T00:00:00");if(Number.isNaN(d.getTime()))return"-";return new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d)}
    function formatDateDot(value,short=false){if(!value)return"";const d=new Date(value+"T00:00:00");if(Number.isNaN(d.getTime()))return"";const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return short?`${m}.${day}`:`${y}.${m}.${day}`}
    function validUrl(value){if(!value)return false;if(/^\/files\/[a-f0-9]{64}\.(pdf|xlsx|xls)$/.test(value))return true;try{const u=new URL(value);return u.protocol==="http:"||u.protocol==="https:"}catch{return false}}
    function showToast(message){$("toast").textContent=message;$("toast").hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>$("toast").hidden=true,2400)}
    function setStatus(id,message,error=false){const box=$(id);box.replaceChildren();if(!message)return;const div=document.createElement("div");div.className="status-box"+(error?" error":"");div.textContent=message;box.appendChild(div)}

    function friendlyErrorMessage(error,operation="요청"){
      const raw=String(error?.message||"").toLowerCase(),code=String(error?.code||"");
      console.error(`[${operation}]`,error);
      if(code==="DUPLICATE_EMAIL")return "이미 등록된 회사 이메일입니다. 해당 사원을 검색해 수정하세요.";
      if(code==="EDIT_CONFLICT")return "다른 관리자가 먼저 수정했습니다. 최신 정보를 불러온 뒤 다시 입력하세요.";
      if(code==="42501"||raw.includes("row-level security")||raw.includes("permission")||raw.includes("권한"))return "이 작업을 수행할 권한이 없습니다.";
      if(raw.includes("network")||raw.includes("fetch")||raw.includes("timeout")||raw.includes("connection"))return "서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.";
      if(code==="23505"||raw.includes("duplicate")||raw.includes("이미"))return "이미 등록된 데이터입니다.";
      if(code==="23503"||raw.includes("foreign key")||raw.includes("연결된"))return "연결된 자료가 있어 처리할 수 없습니다.";
      if(code==="22007"||code==="22008"||raw.includes("date")||raw.includes("time"))return "입력한 날짜 또는 시간을 확인하세요.";
      return `${operation}을 완료하지 못했습니다. 잠시 후 다시 시도하세요.`;
    }
    function openModal(id){$(id).hidden=false;document.body.classList.add("modal-open")}
    function closeModal(id){$(id).hidden=true;const any=[...document.querySelectorAll(".modal-backdrop")].some(x=>!x.hidden);document.body.classList.toggle("modal-open",any)}
    function renderSkeleton(tbodyId,columns,rows=6){const body=$(tbodyId);body.replaceChildren();const f=document.createDocumentFragment();for(let r=0;r<rows;r++){const tr=document.createElement("tr");for(let c=0;c<columns;c++){const td=document.createElement("td");const line=document.createElement("div");line.className="skeleton";line.style.width=`${52+((r+c)*17)%42}%`;td.appendChild(line);tr.appendChild(td)}f.appendChild(tr)}body.appendChild(f)}
    function addTextCell(tr,value,className="",title=""){const td=document.createElement("td");td.textContent=value??"-";if(className)td.className=className;if(title||value)td.title=title||String(value);tr.appendChild(td);return td}
    function statusBadge(status){const span=document.createElement("span");let cls="status-other";if(status==="employed")cls="status-active";else if(["china_expat","leave","non_regular","long_trip"].includes(status))cls="status-warning";else if(status==="retired")cls="status-retired";span.className=`status-badge ${cls}`;const dot=document.createElement("span");dot.className="status-dot";const label=document.createElement("span");label.textContent=statusLabels[status]||status;span.append(dot,label);return span}
