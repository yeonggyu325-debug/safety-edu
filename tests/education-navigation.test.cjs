'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const education=fs.readFileSync(path.join(__dirname,'../js/education.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../js/education-ui.js'),'utf8');
class Element{
 constructor(){this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.classes=new Set();this.classList={toggle:(key,value)=>value?this.classes.add(key):this.classes.delete(key)};}
 replaceChildren(){this.children=[];}appendChild(child){this.children.push(child);}setAttribute(key,value){this.attributes[key]=value;}
}
function fixture(admin=false){
 const categories=[
 {id:1,category_code:'regular',category_name:'정기안전보건교육',parent_id:null,display_order:1},
 {id:2,category_code:'special',category_name:'특별안전교육',parent_id:null,display_order:2},
 {id:3,category_code:'crane',category_name:'크레인',parent_id:2,display_order:1},
 {id:4,category_code:'special-75v-live-work',category_name:'75V 이상 정전 및 활선',parent_id:2,display_order:2},
 {id:5,category_code:'confined',category_name:'밀폐공간',parent_id:2,display_order:3},
 {id:6,category_code:'hiring',category_name:'채용시교육',parent_id:null,display_order:3},
 {id:7,category_code:'regular-child',category_name:'정기 세부교육',parent_id:1,display_order:1}
 ];
 const links=categories.map(x=>({id:x.id,category_id:x.id}));
 const nodes={categoryMenu:new Element(),educationSubcategories:new Element()};
 const ctx={state:{isAdmin:admin,currentView:'education',categories:[],educationLinks:[],selectedCategoryId:1},
 document:{getElementById:id=>nodes[id],createElement:()=>new Element(),querySelectorAll:()=>[]},
 renderSkeleton(){},setStatus(){},fillEducationCategories(){},renderEducationTable(){},showView(name){ctx.state.currentView=name},
 categoryMeta(id){const c=ctx.state.categories.find(x=>x.id===Number(id));return {type:c&&(c.id===1||c.parent_id===1)?'regular':'special'}},
 console,db:{from(table){return {select(){return this},eq(){return this},order(){return this},range(){return this},then(resolve,reject){return Promise.resolve({data:table==='education_categories'?categories:table==='education_links'?links:[],error:null}).then(resolve,reject)}}},rpc:async()=>({data:[],error:null})}};
 ctx.window=ctx;ctx.$=id=>nodes[id];vm.createContext(ctx);vm.runInContext(education,ctx);
 vm.runInContext('const byId=id=>document.getElementById(id);'+ui.slice(ui.indexOf('  function categoryChildren'),ui.indexOf('  function educationDateValue')),ctx);
 const select=ctx.selectCategory;ctx.selectCategory=category=>{select(category);ctx.renderCategoryMenu()};
 return {ctx,nodes,categories};
}
test('Public education view removes regular categories and links, replaces stale regular selection, while administrators retain them',async()=>{
 const {ctx,nodes}=fixture();await ctx.loadPublicData();
 assert.equal(ctx.state.selectedCategoryId,2);
 assert.deepEqual(Array.from(ctx.state.categories,x=>x.id).sort(),[2,3,4,5,6]);
 assert.ok(ctx.state.educationLinks.every(x=>x.category_id!==1&&x.category_id!==7));
 assert.deepEqual(nodes.categoryMenu.children.map(x=>x.children[0].textContent),['특별안전교육','채용시교육']);
 const admin=fixture(true);await admin.ctx.loadPublicData();assert.equal(admin.ctx.state.selectedCategoryId,1);assert.equal(admin.ctx.state.educationLinks.length,7);
 assert.ok(admin.nodes.categoryMenu.children.some(x=>x.children[0].textContent==='정기안전보건교육'));
 admin.ctx.state.isAdmin=false;await admin.ctx.loadPublicData();assert.equal(admin.ctx.state.selectedCategoryId,2);
});
test('Special education selection keeps child filters visible, supports child and all selection, and clears filters on hiring education',async()=>{
 const {ctx,nodes}=fixture();await ctx.loadPublicData();
 nodes.categoryMenu.children[0].children[0].onclick();
 assert.equal(nodes.educationSubcategories.hidden,false);
 assert.deepEqual(nodes.educationSubcategories.children.map(x=>x.textContent),['전체','크레인','75V 이상 정전 및 활선','밀폐공간']);
 nodes.educationSubcategories.children[2].onclick();assert.equal(ctx.state.selectedCategoryId,4);
 assert.equal(nodes.educationSubcategories.hidden,false);assert.equal(nodes.educationSubcategories.children[2].attributes['aria-pressed'],'true');
 nodes.educationSubcategories.children[0].onclick();assert.equal(ctx.state.selectedCategoryId,2);
 nodes.categoryMenu.children[1].children[0].onclick();assert.equal(ctx.state.selectedCategoryId,6);assert.equal(nodes.educationSubcategories.hidden,true);
});
