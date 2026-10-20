'use strict';
const {DatabaseSync}=require('node:sqlite');
const {createParticipantSearch}=require('./participant-search.cjs');
class CloudError extends Error{constructor(message,status=400,code='VALIDATION'){super(message);this.status=status;this.code=code}}
const fields={
 education_categories:{id:'INTEGER PRIMARY KEY',category_code:'TEXT',category_name:'TEXT',parent_id:'INTEGER',display_order:'INTEGER',is_active:'INTEGER'},
 education_links:{id:'INTEGER PRIMARY KEY',category_id:'INTEGER',title:'TEXT',education_topic:'TEXT',first_session_date:'TEXT',second_session_date:'TEXT',conducted_date:'TEXT',web_url:'TEXT',result_report_url:'TEXT',updated_at:'TEXT',display_order:'INTEGER',is_active:'INTEGER'},
 employee_departments:{id:'INTEGER PRIMARY KEY',department_name:'TEXT',is_active:'INTEGER'},
 employees:{id:'INTEGER PRIMARY KEY',employee_name:'TEXT',department_id:'INTEGER'},
 education_participants:{id:'INTEGER PRIMARY KEY',education_link_id:'INTEGER',employee_id:'INTEGER',target_status:'TEXT'}
};
const filePattern=/^[a-f0-9]{64}\.(pdf|xlsx|xls)$/;
function createLibrary(snapshot){
 if(!snapshot||snapshot.schemaVersion!==1||!Number.isFinite(Date.parse(snapshot.publishedAt)))throw new CloudError('게시 자료 형식이 올바르지 않습니다.',503,'INVALID_SNAPSHOT');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('BEGIN');
  for(const [table,columns]of Object.entries(fields)){
   const rows=snapshot[table];if(!Array.isArray(rows)||rows.length>50000)throw new Error('Invalid snapshot rows');
   db.exec('CREATE TABLE '+table+'('+Object.entries(columns).map(([k,v])=>k+' '+v).join(',')+')');
   const names=Object.keys(columns),insert=db.prepare('INSERT INTO '+table+'('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')');
   for(const row of rows){if(!row||typeof row!=='object'||Object.keys(row).some(k=>!names.includes(k)))throw new Error('Unexpected snapshot field');insert.run(...names.map(k=>typeof row[k]==='boolean'?Number(row[k]):row[k]??null))}
  }
  db.exec('COMMIT;PRAGMA query_only=ON;');
  const search=createParticipantSearch(db,{AppError:CloudError});
  return {snapshot,search,close:()=>db.close(),query(q){
   if(!['education_categories','education_links'].includes(q.table))throw new CloudError('관리자 전용 정보입니다.',401,'AUTH_REQUIRED');
   if(q.action&&q.action!=='select')throw new CloudError('클라우드에서는 조회만 가능합니다. 등록·수정은 관리 서버에서 진행하세요.',403,'READ_ONLY');
   const columns=fields[q.table],column=k=>{if(!Object.hasOwn(columns,k))throw new CloudError('조회 항목을 확인하세요.');return k};
   const selected=!q.columns||q.columns==='*'?'*':String(q.columns).split(',').map(column).join(',');
   const bindings=[],conditions=[];
   for(const f of q.filters||[]){
    const c=column(f.column);
    if(f.op==='eq'){conditions.push(c+'=?');bindings.push(typeof f.value==='boolean'?Number(f.value):f.value)}
    else if(f.op==='in'&&Array.isArray(f.value)&&f.value.length<=1000){conditions.push(c+' IN ('+f.value.map(()=>'?').join(',')+')');bindings.push(...f.value)}
    else throw new CloudError('지원하지 않는 조회 조건입니다.');
   }
   if(q.or)throw new CloudError('지원하지 않는 조회 조건입니다.');
   const orders=(q.orders||[]).map(o=>column(o.column)+(o.ascending===false?' DESC':' ASC')+(o.nullsFirst===false?' NULLS LAST':''));
   const limit=q.limit??50000,offset=q.offset??0;if(!Number.isInteger(limit)||limit<0||limit>50000||!Number.isInteger(offset)||offset<0)throw new CloudError('조회 범위를 확인하세요.');
   return db.prepare('SELECT '+selected+' FROM '+q.table+(conditions.length?' WHERE '+conditions.join(' AND '):'')+(orders.length?' ORDER BY '+orders.join(','):'')+' LIMIT ? OFFSET ?').all(...bindings,limit,offset).map(row=>{const r={...row};if('is_active'in r)r.is_active=Boolean(r.is_active);return r});
  },file(name){if(!filePattern.test(name))return null;const linked=snapshot.education_links.some(l=>l.web_url==='/files/'+name||l.result_report_url==='/files/'+name);return linked?(snapshot.files||[]).find(f=>f.filename===name):null}};
 }catch(error){db.close();throw error}
}
async function readSnapshot(getBlob){
 const result=await getBlob('library/current.json',{access:'private',useCache:false,abortSignal:AbortSignal.timeout(15000)});
 if(!result||result.statusCode!==200)throw new CloudError('클라우드 자료가 아직 게시되지 않았습니다.',503,'LIBRARY_UNAVAILABLE');
 let bytes=0;const chunks=[];for await(const chunk of result.stream){bytes+=chunk.length;if(bytes>8*1024*1024)throw new CloudError('게시 자료 용량을 확인하세요.',503,'INVALID_SNAPSHOT');chunks.push(chunk)}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function createLibraryLoader(getBlob,{now=Date.now}={}){
 let cached=null,until=0,pending=null;
 return async()=>{if(cached&&now()<until)return cached;if(pending)return pending;
  pending=(async()=>{const next=createLibrary(await readSnapshot(getBlob)),old=cached;cached=next;until=now()+30000;old?.close();return cached})().finally(()=>{pending=null});
  return pending;
 };
}
module.exports={fields,filePattern,CloudError,createLibrary,createLibraryLoader};
