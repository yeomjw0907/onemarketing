import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { audit,create,list,update,db,dataDir } from './db';
import { requireRecord } from './domain';
import type { RecordData } from './types';
export const filesDir=path.join(dataDir,'files');mkdirSync(filesDir,{recursive:true});
export function assetPath(a:RecordData){const name=String(a.storageName);if(!/^[a-f0-9-]+\.[a-z0-9]+$/.test(name))throw new Error('잘못된 파일 경로입니다.');return path.join(filesDir,name);}
export function bytes(a:RecordData){return readFileSync(assetPath(a));}
export function detectMime(buffer:Buffer,extension:string){
 if(extension==='png'&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';
 if(['jpg','jpeg'].includes(extension)&&buffer[0]===255&&buffer[1]===216)return'image/jpeg';
 if(extension==='webp'&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return'image/webp';
 if(extension==='mp4'&&buffer.toString('ascii',4,8)==='ftyp')return'video/mp4';
 if(extension==='xlsx'&&buffer.toString('ascii',0,2)==='PK')return'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 if(['csv','txt','md'].includes(extension)&&!buffer.includes(0))return'text/plain; charset=utf-8';
 throw new Error('파일 확장자와 실제 내용이 맞지 않거나 지원하지 않는 형식입니다.');
}
export async function extractSheet(buffer:Buffer,ext:string){
 if(!['xlsx','csv'].includes(ext))return null;
 if(ext==='csv')return buffer.toString('utf8').replace(/^\uFEFF/,'').slice(0,50000);
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
 let count=0;const sheets:string[]=[];
 for(const sheet of workbook.worksheets.slice(0,5)){const rows:string[]=[];sheet.eachRow(row=>{if(++count>300)return;const fields:string[]=[];row.eachCell({includeEmpty:true},cell=>{if(fields.length>=30)return;const v=cell.value;fields.push(typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v).slice(0,1000):'');});rows.push(fields.join('\t'));});sheets.push(`[${sheet.name}]\n${rows.join('\n')}`);}
 return sheets.join('\n\n').slice(0,50000);
}
export function saveAsset(input:{projectId:string;taskId?:string;category:string;name:string;buffer:Buffer;text?:string;extracted?:string|null;slot?:string;jobId?:string},actor:string){
 const project=requireRecord(input.projectId,'projects');if(project.settled||['completed','cancelled'].includes(String(project.status)))throw new Error('마감한 프로젝트에는 자료를 추가할 수 없습니다.');
 if(input.taskId){const task=requireRecord(input.taskId,'tasks');if(task.projectId!==project.id)throw new Error('다른 프로젝트의 작업입니다.');if(['delivered','submitted','verified'].includes(String(task.status)))throw new Error('이미 전달된 작업입니다. 새 프로젝트로 변경 내용을 관리하세요.');}
 const ext=path.extname(input.name).slice(1).toLowerCase(),mime=detectMime(input.buffer,ext),hash=createHash('sha256').update(input.buffer).digest('hex');
 if(input.category==='image'&&!mime.startsWith('image/'))throw new Error('이미지 형식이 아닙니다.');if(input.category==='video'&&mime!=='video/mp4')throw new Error('MP4 영상이 아닙니다.');
 const duplicate=list('assets').find(a=>a.projectId===project.id&&a.category==='image'&&a.hash===hash&&a.taskId!==input.taskId&&a.current===true);
 if(input.category==='image'&&duplicate)throw new Error('다른 게시 작업에 사용한 이미지입니다. 중복되지 않는 이미지를 등록하세요.');
 const storageName=randomUUID()+'.'+ext;writeFileSync(path.join(filesDir,storageName),input.buffer);
 return db.transaction(()=>{
 const slot=input.slot||(input.category==='copy'||input.category==='video'?input.category:randomUUID());
 if(input.taskId&&input.category!=='source'){
  for(const a of list('assets').filter(a=>a.taskId===input.taskId&&a.slot===slot&&a.current===true))update(a.id,{current:false});
  const t=requireRecord(input.taskId);update(t.id,{status:'review',approvedAssets:[]});
  if(['ready','publishing'].includes(String(project.status)))update(project.id,{status:'review'});
 }
 const a=create('assets',{projectId:input.projectId,customerId:project.customerId,taskId:input.taskId||null,category:input.category,name:path.basename(input.name),mime,hash,storageName,size:input.buffer.length,current:true,slot,text:input.text||null,extracted:input.extracted||null,jobId:input.jobId||null});audit(actor,'asset-created',a.id,{projectId:project.id});return a;
 })();
}
