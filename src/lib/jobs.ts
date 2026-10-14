import { z } from 'zod';
import { create,get,list,update,db,audit,once } from './db';
import { requireRecord } from './domain';
import type { RecordData } from './types';
export const jobSchema=z.object({projectId:z.string().min(1),taskId:z.string().optional(),type:z.enum(['research','copy','image','video','slideshow']),estimate:z.number().int().min(1).max(1000000),key:z.string().uuid()});
export function enqueue(input:unknown,actor:string){const body=jobSchema.parse(input);return once(actor+':job:'+body.key,()=>{
 const p=requireRecord(body.projectId,'projects');if(p.settled||p.hold||['completed','cancelled'].includes(String(p.status)))throw new Error('마감·보류한 프로젝트입니다.');
 if(body.type==='research'){
  if(!['planning','brief_review'].includes(String(p.status)))throw new Error('기획 단계에서 조사할 수 있습니다.');
  for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY'])if(!process.env[key])throw new Error(`${key} 설정이 필요합니다.`);
 }else{
  if(!['producing','review'].includes(String(p.status)))throw new Error('기획 승인 후 제작할 수 있습니다.');
  if(!body.taskId)throw new Error('게시 작업을 선택하세요.');const t=requireRecord(body.taskId,'tasks');if(t.projectId!==p.id)throw new Error('프로젝트가 다릅니다.');if(!t.briefApprovedAt)throw new Error('기획 승인이 필요합니다.');
  if(['approved','delivered','submitted','verified'].includes(String(t.status)))throw new Error('승인본이 있습니다. 수정 요청을 먼저 등록하세요.');
  const needed=body.type==='copy'?'ANTHROPIC_API_KEY':body.type==='image'?'OPENAI_API_KEY':body.type==='video'?'HIGGSFIELD_API_KEY_ID':null;if(needed&&!process.env[needed])throw new Error(`${needed} 설정이 필요합니다.`);
  if(body.type==='video'&&!process.env.HIGGSFIELD_API_KEY_SECRET)throw new Error('영상 API secret 설정이 필요합니다.');
  if(['image','video'].includes(body.type)&&!list('assets').some(a=>a.projectId===p.id&&a.category==='source'&&String(a.mime).startsWith('image/')))throw new Error('제품 기준 사진을 먼저 등록하세요.');
 }
 if(list('jobs').some(j=>j.projectId===p.id&&j.taskId===(body.taskId||null)&&j.type===body.type&&['pending','running','uncertain'].includes(String(j.status))))throw new Error('이미 실행 중이거나 확인이 필요한 같은 작업이 있습니다.');
 const reserved=list('jobs').filter(j=>j.projectId===p.id&&['pending','running','uncertain'].includes(String(j.status))).reduce((s,j)=>s+Number(j.estimate),0);
 const spent=list('costs').filter(c=>c.projectId===p.id&&c.category==='ai').reduce((s,c)=>s+Number(c.amount),0);
 if(spent+reserved+body.estimate>Number(p.budget))throw new Error('AI 제작비 상한을 초과합니다. 예산을 확인하세요.');
 const snapshot={project:p,task:body.taskId?requireRecord(body.taskId):null,sourceAssets:list('assets').filter(a=>a.projectId===p.id&&a.category==='source').map(a=>a.id)};
 const row=create('jobs',{...body,key:undefined,taskId:body.taskId||null,status:'pending',attempts:0,actor,snapshot,reservation:body.estimate,providerState:{},error:null});audit(actor,'job-enqueued',p.id,{jobId:row.id,type:body.type});return row;
 });}
export function claimJob(owner:string){return db.transaction(()=>{
 const lease=db.prepare('SELECT owner,expires FROM leases WHERE key=?').get('worker') as {owner:string;expires:number}|undefined;
 if(lease&&lease.expires>Date.now()&&lease.owner!==owner)return null;
 db.prepare('INSERT INTO leases VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires=excluded.expires').run('worker',owner,Date.now()+60000);
 for(const running of list('jobs').filter(j=>j.status==='running'))update(running.id,{status:'uncertain',error:'작업 서버가 중단되었습니다. 공급사 실행·비용을 확인한 뒤 재개하세요.'});
 const job=list('jobs').filter(j=>j.status==='pending').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];if(!job)return null;
 return update(job.id,{status:'running',owner,startedAt:new Date().toISOString(),attempts:Number(job.attempts)+1});
 })();}
export function renewLease(owner:string){db.prepare('UPDATE leases SET expires=? WHERE key=? AND owner=?').run(Date.now()+60000,'worker',owner);}
export function releaseLease(owner:string){db.prepare('DELETE FROM leases WHERE key=? AND owner=?').run('worker',owner);}
export function recordCall(jobId:string,provider:string,model:string,requestId:unknown,usage:unknown){const j=requireRecord(jobId,'jobs');const calls=[...(Array.isArray(j.calls)?j.calls:[]),{provider,model,requestId,usage,at:new Date().toISOString()}];return update(jobId,{calls});}
export function jobResult(jobId:string,patch:Record<string,unknown>){return update(jobId,patch);}
export function jobInput(job:RecordData){const s=job.snapshot as {project:RecordData;task:RecordData|null;sourceAssets:string[]};const knowledge=s.project.knowledge as {customer:RecordData;product:RecordData};return{...s,knowledge};}
