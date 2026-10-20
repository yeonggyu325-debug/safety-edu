'use strict';
// Deliberately publish an explicit static allowlist. No server/data/config files.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public');
fs.mkdirSync(out,{recursive:true});
for(const file of ['index.html','assets/company-logo.png',...fs.readdirSync(path.join(root,'js')).filter(n=>n.endsWith('.js')).map(n=>'js/'+n),...fs.readdirSync(path.join(root,'css')).filter(n=>n.endsWith('.css')).map(n=>'css/'+n)]){
 const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);
}
for(const page of ['login.html','setup.html'])fs.writeFileSync(path.join(out,page),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>교육자료실</title><p>이 사이트는 교육자료 조회용입니다. 등록·수정은 기존 관리 서버를 이용하세요.</p><a href="/">교육자료실로 돌아가기</a></html>');
fs.writeFileSync(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
console.log('Built public UI without database, source, backups or credentials.');
