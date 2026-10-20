"use strict";
    function normalizedCategoryName(value){return String(value||"").replace(/\s+/g,"")}
    function sortEducationCategories(categories){
      const desired=["크레인","75V이상정전및활선","밀폐공간"];
      return [...(categories||[])].sort((a,b)=>{
        if(Number(a.parent_id||0)!==Number(b.parent_id||0))return Number(a.display_order||999)-Number(b.display_order||999)||Number(a.id)-Number(b.id);
        const parent=categories.find(x=>Number(x.id)===Number(a.parent_id));
        if(normalizedCategoryName(parent?.category_name).includes("특별안전교육")){
          const ai=desired.findIndex(name=>normalizedCategoryName(a.category_name).includes(name));
          const bi=desired.findIndex(name=>normalizedCategoryName(b.category_name).includes(name));
          if(ai!==bi)return (ai<0?999:ai)-(bi<0?999:bi);
        }
        return Number(a.display_order||999)-Number(b.display_order||999)||Number(a.id)-Number(b.id);
      });
    }
    async function ensureRequiredSpecialCategory(categories){
      const targetName="75V 이상 정전 및 활선";
      const exists=categories.some(x=>normalizedCategoryName(x.category_name)===normalizedCategoryName(targetName));
      if(exists||!state.isAdmin)return categories;
      const root=categories.find(x=>!x.parent_id&&normalizedCategoryName(x.category_name).includes("특별안전교육"));
      if(!root)return categories;
      const crane=categories.find(x=>Number(x.parent_id)===Number(root.id)&&normalizedCategoryName(x.category_name).includes("크레인"));
      const payload={category_code:"special-75v-live-work",category_name:targetName,parent_id:Number(root.id),display_order:Number(crane?.display_order||1)+1,is_active:true};
      const result=await db.from("education_categories").insert(payload).select("id,category_code,category_name,parent_id,display_order,is_active").single();
      if(result.error){console.warn("[특별안전교육 카테고리 추가]",result.error);return categories}
      const confined=categories.find(x=>Number(x.parent_id)===Number(root.id)&&normalizedCategoryName(x.category_name).includes("밀폐공간"));
      const updates=[];
      if(crane)updates.push(db.from("education_categories").update({display_order:1}).eq("id",crane.id));
      updates.push(db.from("education_categories").update({display_order:2}).eq("id",result.data.id));
      if(confined)updates.push(db.from("education_categories").update({display_order:3}).eq("id",confined.id));
      await Promise.allSettled(updates);
      return [...categories,result.data];
    }

    async function fetchAllEducationParticipantDateRows(){
      const rows=[],pageSize=1000,maxPages=50;
      for(let page=0;page<maxPages;page++){
        const from=page*pageSize,to=from+pageSize-1;
        const result=await db.from("education_participants")
          .select("id,education_link_id,education_date")
          .order("id",{ascending:true})
          .range(from,to);
        if(result.error)return {data:rows,error:result.error};
        const batch=result.data||[];rows.push(...batch);
        if(batch.length<pageSize)return {data:rows,error:null};
      }
      console.warn("[교육 대상자 날짜 조회] 최대 조회 페이지에 도달했습니다.");
      return {data:rows,error:null};
    }

    function isRegularEducationCategory(category,categories){
      const parent=categories.find(item=>Number(item.id)===Number(category?.parent_id));
      return [category,parent].some(item=>item&&(item.category_code==="regular"||normalizedCategoryName(item.category_name).includes("정기안전보건교육")));
    }
    async function loadPublicData(){
      renderSkeleton("educationTableBody",state.isAdmin?7:6,6);
      const [categoriesResult,linksResult,currentEmployeesResult]=await Promise.all([
        db.from("education_categories")
          .select("id,category_code,category_name,parent_id,display_order,is_active")
          .eq("is_active",true)
          .order("display_order")
          .order("id"),
        db.from("education_links")
          .select("*")
          .order("first_session_date",{ascending:false,nullsFirst:false})
          .order("second_session_date",{ascending:false,nullsFirst:false})
          .order("individual_start_date",{ascending:false,nullsFirst:false})
          .order("updated_at",{ascending:false}),
        state.isAdmin?db.rpc("get_current_employees"):Promise.resolve({data:[],error:null})
      ]);
      if(categoriesResult.error||linksResult.error){
        console.error(categoriesResult.error||linksResult.error);
        setStatus("educationStatus","교육자료를 불러오지 못했습니다.",true);
        return;
      }
      state.categories=sortEducationCategories(await ensureRequiredSpecialCategory(categoriesResult.data||[]));
      if(!state.isAdmin)state.categories=state.categories.filter(category=>!isRegularEducationCategory(category,state.categories));
      const visibleCategoryIds=new Set(state.categories.map(category=>Number(category.id)));
      state.educationLinks=(linksResult.data||[]).filter(link=>visibleCategoryIds.has(Number(link.category_id)));
      state.monthlyHistoryLoaded=false;state.monthlyHistoryRows=[];state.monthlyHistoryMonths=[];
      state.currentEmployeeTotal=currentEmployeesResult.error?null:(currentEmployeesResult.data||[]).length;
      const participantRowsResult=state.isAdmin?await fetchAllEducationParticipantDateRows():{data:[],error:null};
      state.educationParticipantCounts=new Map();
      state.educationIndividualRanges=new Map();
      const linkMap=new Map(state.educationLinks.map(item=>[String(item.id),item]));
      state.educationLinks.forEach(link=>{
        if(categoryMeta(link.category_id).type!=="regular"||!link.individual_start_date)return;
        state.educationIndividualRanges.set(String(link.id),{start:link.individual_start_date,end:link.individual_end_date||link.individual_start_date});
      });
      if(!participantRowsResult.error){
        const datesByLink=new Map();
        (participantRowsResult.data||[]).forEach(row=>{
          const key=String(row.education_link_id);state.educationParticipantCounts.set(key,(state.educationParticipantCounts.get(key)||0)+1);
          const link=linkMap.get(key),date=row.education_date;
          if(!link||categoryMeta(link.category_id).type!=="regular"||!date)return;
          if(!datesByLink.has(key))datesByLink.set(key,[]);datesByLink.get(key).push(date);
        });
        datesByLink.forEach((allDates,key)=>{
          const link=linkMap.get(key),unique=[...new Set(allDates)].sort();
          const withoutSessions=unique.filter(date=>date!==link.first_session_date&&date!==link.second_session_date);
          const effective=withoutSessions.length?withoutSessions:unique;
          if(effective.length)state.educationIndividualRanges.set(key,{start:effective[0],end:effective[effective.length-1]});
        });
      }
      renderCategoryMenu();
      fillEducationCategories();
      if(!state.categories.some(category=>Number(category.id)===Number(state.selectedCategoryId))){
        const visibleCategories=state.categories;
        const first=visibleCategories.find(x=>x.category_code==="regular")
          ||visibleCategories.find(x=>x.parent_id===null)
          ||visibleCategories[0];
        if(first)selectCategory(first);
      }else{
        renderEducationTable();
      }
    }

    function renderCategoryMenu(){
      const nav=$("categoryMenu");
      nav.replaceChildren();
      const roots=state.categories.filter(x=>x.parent_id===null);
      roots.forEach(root=>{
        const children=state.categories.filter(x=>Number(x.parent_id)===Number(root.id));
        const wrapper=document.createElement("div");
        const button=document.createElement("button");
        button.type="button";
        button.className="menu-button";
        button.dataset.categoryId=root.id;
        const label=document.createElement("span");
        label.textContent=root.category_name;
        button.appendChild(label);
        if(children.length){
          const caret=document.createElement("span");
          caret.className="caret";
          button.appendChild(caret);
          button.setAttribute("aria-expanded","true");
          const sub=document.createElement("div");
          sub.className="submenu";
          children.forEach(child=>{
            const childButton=document.createElement("button");
            childButton.type="button";
            childButton.className="submenu-button";
            childButton.dataset.categoryId=child.id;
            childButton.textContent=child.category_name;
            childButton.onclick=()=>selectCategory(child);
            sub.appendChild(childButton);
          });
          button.onclick=()=>{
            const expanded=button.getAttribute("aria-expanded")==="true";
            button.setAttribute("aria-expanded",String(!expanded));
            sub.hidden=expanded;
          };
          wrapper.append(button,sub);
        }else{
          button.onclick=()=>selectCategory(root);
          wrapper.appendChild(button);
        }
        nav.appendChild(wrapper);
      });
      updateCategoryActive();
    }

    function selectCategory(category){
      state.selectedCategoryId=category.id;
      state.selectedCategoryName=category.category_name;
      showView("education");
      updateCategoryActive();
      renderEducationTable();
    }

    function updateCategoryActive(){
      document.querySelectorAll("[data-category-id]").forEach(button=>{
        button.classList.toggle("active",Number(button.dataset.categoryId)===Number(state.selectedCategoryId));
      });
    }

    function renderEducationHeader(type){
      const colgroup=$("educationColgroup"),header=$("educationTableHeader"),table=$("educationDataTable");
      colgroup.replaceChildren();header.replaceChildren();table.dataset.educationType=type;
      const columns=type==="regular"?[
        ["no","No."],["date","실시일"],["title","교육명"],["topic","교육 주제"],["material","교육자료"],["report","결과보고서"]
      ]:[
        ["no","No."],["date","실시일"],["category","교육구분"],["report","결과보고서"]
      ];
      if(state.isAdmin)columns.push(["manage","관리"]);
      columns.forEach(([key,label])=>{
        const col=document.createElement("col");col.className=`education-col-${key}`;colgroup.appendChild(col);
        const th=document.createElement("th");th.scope="col";th.className="center";th.textContent=label;header.appendChild(th);
      });
    }
