'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Element{
 constructor(attrs={}){this.attrs={...attrs};this.listeners={};this.buttons=[];this.style={};this.textContent='';this.focused=false;}
 getAttribute(key){return this.attrs[key]??null}setAttribute(key,value){this.attrs[key]=value}removeAttribute(key){delete this.attrs[key]}
 addEventListener(name,fn){this.listeners[name]=fn}after(button){this.buttons.push(button)}focus(){this.focused=true}
}
function fixture(){
 const link=url=>Object.assign(new Element({href:url}),{textContent:'Material'});
 const links=[link('https://company.example/material.pdf?token=keep'),link('https://company.example/weblink/secure_down_list.jsp?wlkey=keep'),link('https://company.example/file.xlsx'),link('javascript:alert(1)')];
 const ids=Object.fromEntries(['educationTableBody','pdfPreviewDialog','pdfPreviewFrame','pdfPreviewTitle','pdfPreviewNotice','pdfPreviewOriginal','pdfPreviewClose'].map(id=>[id,new Element()]));
 const body=new Element();body.style.overflow='auto';
 ids.educationTableBody.querySelectorAll=()=>links;
 ids.pdfPreviewDialog.showModal=()=>ids.pdfPreviewDialog.open=true;
 ids.pdfPreviewDialog.close=()=>{ids.pdfPreviewDialog.open=false;ids.pdfPreviewDialog.listeners.close()};
 let observe;
 const context=vm.createContext({URL,location:{href:'http://127.0.0.1:3000/'},document:{body,getElementById:id=>ids[id],createElement:()=>new Element()},MutationObserver:class{constructor(fn){observe=fn}observe(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/pdf-preview.js'),'utf8'),context);
 return {links,ids,body,link,refresh:()=>observe()};
}
test('PDF preview keeps original URLs, adds separate buttons, clears the viewer on close and handles rerenders',()=>{
 const f=fixture(),url=f.links[0].getAttribute('href');
 assert.equal(f.links[0].buttons.length,1);assert.equal(f.links[1].buttons.length,1);assert.equal(f.links[2].buttons.length,0);assert.equal(f.links[3].buttons.length,0);
 f.links[0].buttons[0].listeners.click();
 assert.equal(f.ids.pdfPreviewDialog.open,true);assert.equal(f.ids.pdfPreviewFrame.getAttribute('src'),url);
 assert.equal(f.ids.pdfPreviewOriginal.getAttribute('href'),url);assert.equal(f.links[0].getAttribute('href'),url);
 f.ids.pdfPreviewClose.listeners.click();
 assert.equal(f.ids.pdfPreviewFrame.getAttribute('src'),null);assert.equal(f.body.style.overflow,'auto');assert.equal(f.links[0].buttons[0].focused,true);
 f.refresh();assert.equal(f.links[0].buttons.length,1);
 const later=f.link('/files/'+'a'.repeat(64)+'.pdf');f.links.push(later);f.refresh();assert.equal(later.buttons.length,1);
 later.buttons[0].listeners.click();assert.equal(f.ids.pdfPreviewFrame.getAttribute('src'),later.getAttribute('href'));
});
