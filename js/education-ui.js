
(function finalUnifiedIntegrationModule(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const DASH_RE=/^[\-\u2010\u2011\u2012\u2013\u2014\u2212]$/;
  const PAGE_SIZE=25;
  state.educationUnifiedPage=state.educationUnifiedPage||1;

  function normalizeEmptyMarks(root=document){
    const nodes=[];
    if(root.nodeType===1&&root.matches?.('td,th,span,div'))nodes.push(root);
    root.querySelectorAll?.('td,th,span,div').forEach(node=>nodes.push(node));
    nodes.forEach(node=>{
      if(node.matches('input,button,select,option'))return;
      if(node.children.length)return;
      const value=(node.textContent||'').trim();
      if(DASH_RE.test(value)){
        if(node.textContent!=='-')node.textContent='-';
        node.classList.add('ui-empty-mark');
      }else node.classList.remove('ui-empty-mark');
    });
  }
  window.normalizeEmptyMarks=normalizeEmptyMarks;
  const emptyObserver=new MutationObserver(records=>records.forEach(record=>{
    record.addedNodes.forEach(node=>{if(node.nodeType===1)normalizeEmptyMarks(node)});
    if(record.type==='characterData'&&record.target.parentElement)normalizeEmptyMarks(record.target.parentElement);
  }));
  emptyObserver.observe(document.body,{subtree:true,childList:true,characterData:true});

  function selectedEducationMeta(){return categoryMeta(state.selectedCategoryId)}
  function isRegularContext(){return state.currentView==='education'&&selectedEducationMeta().type==='regular'}

  const baseSetEducationPanel=window.setEducationPanel||setEducationPanel;
  window.setEducationPanel=setEducationPanel=function(panel){
    const requested=panel==='monthly'?'monthly':'list';
    if(requested==='monthly'&&!(state.isAdmin&&isRegularContext()))return baseSetEducationPanel('list');
    return baseSetEducationPanel(requested);
  };

  function syncEducationContext(){
    const monthlyTab=byId('educationMonthlyTab');
    const regular=state.isAdmin&&isRegularContext();
    if(monthlyTab)monthlyTab.hidden=!regular;
    if(!regular&&state.educationPanel==='monthly')baseSetEducationPanel('list');
    const importButton=byId('regularHalfYearImportButton');
    if(importButton)importButton.hidden=!(state.isAdmin&&isRegularContext());
  }
  window.syncEducationContext=syncEducationContext;

  const baseShowView=window.showView||showView;
  window.showView=showView=function(name){
    const result=baseShowView(name);
    syncEducationContext();
    renderCategoryMenu();
    normalizeEmptyMarks(document);
    return result;
  };

  const baseSelectCategory=window.selectCategory||selectCategory;
  window.selectCategory=selectCategory=function(category){
    state.educationUnifiedPage=1;
    const type=categoryMeta(category?.id).type;
    if(type!=='regular'&&state.educationPanel==='monthly')baseSetEducationPanel('list');
    const result=baseSelectCategory(category);
    syncEducationContext();
    renderCategoryMenu();
    normalizeEmptyMarks(document);
    return result;
  };

  function categoryChildren(rootId){
    return state.categories.filter(category=>Number(category.parent_id)===Number(rootId));
  }
  function isRoot(category){return category&&!category.parent_id}
  function selectedRootId(){
    const selected=state.categories.find(category=>Number(category.id)===Number(state.selectedCategoryId));
    return selected?.parent_id?Number(selected.parent_id):Number(selected?.id||0);
  }

  function renderEducationSubcategories(){
    const box=byId('educationSubcategories');if(!box)return;
    box.replaceChildren();
    const selected=state.categories.find(category=>Number(category.id)===Number(state.selectedCategoryId));
    const root=selected?.parent_id?state.categories.find(category=>Number(category.id)===Number(selected.parent_id)):selected;
    const children=root?categoryChildren(root.id):[];
    box.hidden=!children.length;
    if(!children.length)return;
    const add=category=>{
      const button=document.createElement('button');button.type='button';button.className='category-chip';
      button.textContent=Number(category.id)===Number(root.id)?'전체':category.category_name;
      const active=Number(category.id)===Number(state.selectedCategoryId);
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
      button.onclick=()=>selectCategory(category);box.appendChild(button);
    };
    add(root);children.forEach(add);
  }
  window.renderEducationSubcategories=renderEducationSubcategories;
  window.renderCategoryMenu=renderCategoryMenu=function(){
    const nav=byId('categoryMenu');if(!nav)return;
    nav.replaceChildren();
    const roots=state.categories.filter(category=>!category.parent_id&&(state.isAdmin||!isRegularEducationCategory(category,state.categories)));
    roots.forEach(root=>{
      const wrapper=document.createElement('div');
      const button=document.createElement('button');button.type='button';button.className='menu-button';
      button.dataset.categoryId=root.id;button.textContent=root.category_name;
      const active=selectedRootId()===Number(root.id)&&state.currentView==='education';
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      button.onclick=()=>selectCategory(root);wrapper.appendChild(button);nav.appendChild(wrapper);
    });
    renderEducationSubcategories();
  };

  function educationDateValue(item){
    return String(item?.first_session_date||item?.conducted_date||item?.second_session_date||item?.individual_start_date||item?.updated_at||'');
  }
  function selectedEducationRows(){
    const selected=state.categories.find(category=>Number(category.id)===Number(state.selectedCategoryId));
    if(!selected)return [];
    const children=categoryChildren(selected.id);
    const type=categoryMeta(selected.id).type;
    const aggregate=isRoot(selected)&&children.length&&type!=='regular';
    const ids=new Set(aggregate?[Number(selected.id),...children.map(child=>Number(child.id))]:[Number(selected.id)]);
    const order=new Map(state.categories.map((category,index)=>[Number(category.id),index]));
    return (state.educationLinks||[]).filter(item=>ids.has(Number(item.category_id))).sort((a,b)=>{
      if(aggregate&&type==='special'){
        const categoryDelta=(order.get(Number(a.category_id))||0)-(order.get(Number(b.category_id))||0);
        if(categoryDelta)return categoryDelta;
      }
      return educationDateValue(b).localeCompare(educationDateValue(a),'ko');
    });
  }
  function ensureEducationPager(){
    let pager=byId('educationPagination');
    if(pager)return pager;
    pager=document.createElement('div');pager.id='educationPagination';pager.className='platform-pagination';pager.setAttribute('aria-label','교육자료 페이지');
    byId('educationStatus')?.before(pager);return pager;
  }
  function renderEducationPager(total,pages){
    const pager=ensureEducationPager();pager.replaceChildren();
    if(total<=PAGE_SIZE){pager.hidden=true;return}
    pager.hidden=false;
    const add=(label,page,active=false,disabled=false)=>{const button=document.createElement('button');button.type='button';button.className='platform-page-button'+(active?' active':'');button.textContent=String(label);button.disabled=disabled;if(!active&&!disabled)button.onclick=()=>{state.educationUnifiedPage=page;renderEducationTable()};pager.appendChild(button)};
    add('이전',Math.max(1,state.educationUnifiedPage-1),false,state.educationUnifiedPage===1);
    for(let page=1;page<=pages;page++)add(page,page,page===state.educationUnifiedPage);
    add('다음',Math.min(pages,state.educationUnifiedPage+1),false,state.educationUnifiedPage===pages);
  }

  window.renderEducationTable=renderEducationTable=function(){
    syncEducationContext();
    const body=byId('educationTableBody');if(!body)return;body.replaceChildren();
    const meta=selectedEducationMeta();renderEducationHeader(meta.type);
    const rows=selectedEducationRows(),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    state.educationUnifiedPage=Math.min(Math.max(1,state.educationUnifiedPage||1),pages);
    const start=(state.educationUnifiedPage-1)*PAGE_SIZE,items=rows.slice(start,start+PAGE_SIZE);
    if(!rows.length){setStatus('educationStatus','등록된 자료가 없습니다.');renderEducationPager(0,1);normalizeEmptyMarks(body);return}
    setStatus('educationStatus','');
    const fragment=document.createDocumentFragment();
    items.forEach((item,index)=>{
      const rowMeta=categoryMeta(item.category_id),tr=document.createElement('tr');
      addTextCell(tr,start+index+1,'center');
      const schedule=addTextCell(tr,scheduleText(item),'center');schedule.style.whiteSpace='pre-line';
      if(meta.type==='regular'){
        addTextCell(tr,item.title||'-','education-text-cell',item.title||'-');
        addTextCell(tr,item.education_topic||'-','education-text-cell',item.education_topic||'-');
        const material=document.createElement('td');material.className='center';
        if(validUrl(item.web_url)){const link=document.createElement('a');link.className='download-link';link.textContent='교육자료';link.href=item.web_url;link.target='_blank';link.rel='noopener noreferrer';material.appendChild(link)}else material.textContent='-';tr.appendChild(material);
      }else{
        const categoryLabel=rowMeta.type==='special'?specialEducationDisplayLabel(rowMeta.label):rowMeta.label;
        addTextCell(tr,categoryLabel,'education-category-text',categoryLabel);
      }
      const report=document.createElement('td');report.className='center';
      if(validUrl(item.result_report_url)){const link=document.createElement('a');link.className='download-link';link.textContent='결과보고서';link.href=item.result_report_url;link.target='_blank';link.rel='noopener noreferrer';report.appendChild(link)}else{const progress=document.createElement('span');progress.className='progress';progress.textContent='보고서 미등록';report.appendChild(progress)}tr.appendChild(report);
      if(state.isAdmin){const manage=document.createElement('td');manage.className='center education-manage-cell';const actions=document.createElement('div');actions.className='row-actions row-action-group';[...(meta.type==='regular'?[]:[['대상자',()=>openParticipants(item),'mini']]),['수정',()=>openEducationForm(item),'mini'],['삭제',()=>deleteEducation(item),'mini mini-danger']].forEach(([label,handler,className])=>{const button=document.createElement('button');button.type='button';button.className=className;button.textContent=label;button.onclick=handler;actions.appendChild(button)});manage.appendChild(actions);tr.appendChild(manage)}
      fragment.appendChild(tr);
    });
    body.appendChild(fragment);renderEducationPager(rows.length,pages);normalizeEmptyMarks(body);
  };

  const baseMonthlyRender=window.renderMonthlyEducationHistory||renderMonthlyEducationHistory;
  window.renderMonthlyEducationHistory=renderMonthlyEducationHistory=function(){
    if(!isRegularContext()){
      if(state.educationPanel==='monthly')baseSetEducationPanel('list');
      return;
    }
    const result=baseMonthlyRender();
    normalizeEmptyMarks(byId('monthlyHistoryTable')||document);
    return result;
  };

  const monthlySearch=byId('monthlyHistorySearch');
  if(monthlySearch){monthlySearch.placeholder='사원명·부서·비대상 사유 검색';monthlySearch.setAttribute('aria-label','사원명, 부서, 비대상 상태 또는 사유 검색')}
  byId('educationListTab')?.addEventListener('click',syncEducationContext);
  byId('educationMonthlyTab')?.addEventListener('click',()=>{if(!isRegularContext())baseSetEducationPanel('list')});

  normalizeEmptyMarks(document);
  syncEducationContext();
})();
