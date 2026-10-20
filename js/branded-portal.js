"use strict";
(function simplePortal(){
 const login=document.getElementById('loginButton');
 const header=document.getElementById('sidebar');
 if(login&&header)header.appendChild(login);
 const brand=document.querySelector('.brand-home');
 brand?.addEventListener('click',event=>{
  event.preventDefault();
  const category=state.categories.find(item=>item.category_code==='regular')||state.categories.find(item=>!item.parent_id);
  if(category)selectCategory(category);
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 });
})();
