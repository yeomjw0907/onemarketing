import { z } from 'zod';
import { audit,create,get,list,update,db,once } from './db';
import type { RecordData, Kind } from './types';
const text=z.string().trim().max(10000);const name=z.string().trim().min(1).max(200);const amount=z.number().int().min(0).max(1e12);const optionalAmount=amount.nullable();
const customer=z.object({name,contact:text.default(''),brand:text.default(''),tone:text.default(''),target:text.default(''),forbidden:text.default(''),notes:text.default('')});
const product=z.object({name,customerId:name,facts:text.default(''),claims:text.default(''),forbidden:text.default(''),preserve:text.default(''),notes:text.default('')});
const price=z.object({name,channel:z.enum(['blog','clip']),sale:amount,payout:optionalAmount,aiEstimate:optionalAmount,images:z.number().int().min(0).max(30),duration:z.number().int().min(0).max(60),mode:z.enum(['slideshow','hybrid','generated']),revisions:z.number().int().min(0).max(10)});
const line=z.object({priceId:name,quantity:z.number().int().min(1).max(100)});
const contract=z.object({name,customerId:name,lines:z.array(line).min(1).max(30),discount:amount.default(0),months:z.number().int().min(1).max(36),setsPerMonth:z.number().int().min(1).max(30),startMonth:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),vatIncluded:z.boolean().default(false),budget:amount.nullable().default(null)});
const project=z.object({name,contractId:name,slot:z.number().int().min(0),productId:name,due:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),instructions:text.default(''),budget:amount});
const schemas={customers:customer,products:product,prices:price,contracts:contract,projects:project};
export function requireRecord(id:string,kind?:Kind){const r=get(id);if(!r||kind&&r.kind!==kind)throw new Error('연결된 항목을 찾을 수 없습니다.');return r;}
export function quote(lines:{priceId:string;quantity:number}[],discount=0){
 const snapshots:RecordData[]=lines.map(l=>{const p=requireRecord(l.priceId,'prices');return {...p,priceId:p.id,quantity:l.quantity};});
 const total=snapshots.reduce((s,p)=>s+Number(p.sale)*Number(p.quantity),0);if(discount>total)throw new Error('할인이 판매액보다 큽니다.');
 const missing=snapshots.some(p=>p.payout===null||p.aiEstimate===null);const cost=missing?null:snapshots.reduce((s,p)=>s+(Number(p.payout)+Number(p.aiEstimate))*Number(p.quantity),0);
 return {snapshots,total,discount,sale:total-discount,cost,margin:cost===null?null:total-discount-cost};
}
export function save(kind:Kind,input:unknown,actor:string,id?:string,version?:number){
 if(!(kind in schemas))throw new Error('직접 수정할 수 없는 항목입니다.');
 const data=schemas[kind as keyof typeof schemas].parse(input) as Record<string,unknown>;
 return db.transaction(()=>{
 if(kind==='products')requireRecord(String(data.customerId),'customers');
 if(kind==='contracts'){
  if(id)throw new Error('확정 계약은 직접 변경할 수 없습니다. 새 계약으로 등록하세요.');
  requireRecord(String(data.customerId),'customers');const calculation=quote(data.lines as {priceId:string;quantity:number}[],Number(data.discount));
  if(calculation.cost===null)throw new Error('지급 단가와 AI 예상 비용을 먼저 입력하세요.');
  if(data.budget!==null&&calculation.sale>Number(data.budget))throw new Error('설정한 예산을 초과합니다.');
  Object.assign(data,calculation,{slotCount:Number(data.months)*Number(data.setsPerMonth),status:'confirmed'});
 }
 if(kind==='projects'){
  if(id)throw new Error('프로젝트 변경은 작업 메뉴에서 처리하세요.');
  const c=requireRecord(String(data.contractId),'contracts'),p=requireRecord(String(data.productId),'products');
  if(c.customerId!==p.customerId)throw new Error('계약과 제품의 고객이 다릅니다.');
  if(Number(data.slot)>=Number(c.slotCount))throw new Error('계약의 제공 범위를 초과합니다.');
  if(list('projects').some(p=>p.contractId===c.id&&p.slot===data.slot))throw new Error('이미 시작한 제공 슬롯입니다.');
  Object.assign(data,{customerId:c.customerId,status:'materials',sale:c.sale,payoutEstimate:(c.snapshots as RecordData[]).reduce((s,l)=>s+Number(l.payout)*Number(l.quantity),0),aiEstimate:(c.snapshots as RecordData[]).reduce((s,l)=>s+Number(l.aiEstimate)*Number(l.quantity),0),knowledge:{customer:requireRecord(String(c.customerId),'customers'),product:p},settled:false,hold:false});
 }
 const row=id?update(id,data,version):create(kind,data);
 if(kind==='projects'){
  const c=requireRecord(String(data.contractId),'contracts');let order=0;
  for(const l of c.snapshots as RecordData[])for(let i=0;i<Number(l.quantity);i++)create('tasks',{projectId:row.id,customerId:c.customerId,name:`${l.name} ${i+1}`,channel:l.channel,images:l.images,duration:l.duration,mode:l.mode,payout:l.payout,payoutStatus:'pending',status:'planned',order:++order,brief:'',assignee:'',link:'',deliveryVersion:[],paidAt:null});
 }
 audit(actor,id?'update':'create',row.id);return row;
 })();
}
export function projectCosts(p:RecordData){const tasks=list('tasks').filter(t=>t.projectId===p.id&&t.status!=='cancelled');const costs=list('costs').filter(c=>c.projectId===p.id);const actual=costs.filter(c=>c.category!=='payout').reduce((s,c)=>s+Number(c.amount),0);const payouts=tasks.reduce((s,t)=>s+Number(t.payout||0),0);const missing=tasks.some(t=>t.payout===null)||costs.some(c=>c.confirmed!==true);const expected=Number(p.payoutEstimate)+Number(p.aiEstimate);return{sale:Number(p.sale),expected,expectedMargin:Number(p.sale)-expected,actual:actual+payouts,margin:Number(p.sale)-actual-payouts,provisional:missing||p.settled!==true};}
export function command(action:string,input:Record<string,unknown>,actor:string,key:string){return once(actor+':'+key,()=>{
 const id=String(input.id||'');const row=requireRecord(id);let result:RecordData=row;
 if(action==='project-stage'){
  if(row.kind!=='projects')throw new Error('프로젝트를 선택하세요.');
  const next=String(input.status);const allowed:Record<string,string[]>= {materials:['planning','cancelled'],planning:['brief_review','cancelled'],brief_review:['planning','producing','cancelled'],producing:['review','cancelled'],review:['producing','ready','cancelled'],ready:['publishing','cancelled'],publishing:['completed','cancelled'],completed:[],cancelled:[]};
  if(!allowed[String(row.status)]?.includes(next))throw new Error('허용되지 않은 단계 변경입니다.');
  const tasks=list('tasks').filter(t=>t.projectId===id&&t.status!=='cancelled');
  if(next==='planning'&&!(list('assets').some(a=>a.projectId===id&&a.category==='source')||String(row.materialNotes||'').trim()))throw new Error('고객 자료 또는 확인한 자료 메모를 먼저 등록하세요.');
  if(next==='brief_review'&&tasks.some(t=>!String(t.brief).trim()))throw new Error('모든 작업의 기획안을 작성하세요.');
  if(next==='producing'&&row.status==='brief_review'){for(const t of tasks)update(t.id,{briefApprovedAt:new Date().toISOString(),briefApprovedBy:actor});}
  if(next==='ready'&&tasks.some(t=>t.status!=='approved'))throw new Error('모든 결과물을 승인하세요.');
  if(next==='completed'&&tasks.some(t=>t.status!=='verified'))throw new Error('모든 게시물을 확인하세요.');
  result=update(id,{status:next},Number(input.version));
 }else if(action==='project-notes'){if(row.kind!=='projects')throw new Error('프로젝트를 선택하세요.');result=update(id,{materialNotes:text.parse(input.materialNotes),instructions:text.parse(input.instructions),budget:amount.parse(input.budget)},Number(input.version));
 }else if(action==='task-edit'){
  if(row.kind!=='tasks')throw new Error('게시 작업을 선택하세요.');const p=requireRecord(String(row.projectId),'projects');
  const brief=text.parse(input.brief),changed=brief!==row.brief;if(changed&&['ready','publishing','completed','cancelled'].includes(String(p.status)))throw new Error('전달 단계 이후에는 기획을 변경할 수 없습니다.');
  result=update(id,{brief,assignee:text.parse(input.assignee),payout:optionalAmount.parse(input.payout),...(changed?{briefApprovedAt:null,status:'planned'}:{})},Number(input.version));
  if(changed&&['producing','review'].includes(String(p.status)))update(p.id,{status:'brief_review'});
 }else if(action==='approve-task'){
  if(row.kind!=='tasks')throw new Error('게시 작업을 선택하세요.');const p=requireRecord(String(row.projectId),'projects');
  if(!['producing','review'].includes(String(p.status)))throw new Error('제작·검수 단계에서 승인할 수 있습니다.');
  const assets=list('assets').filter(a=>a.taskId===id&&a.current===true&&a.category!=='source');
  if(row.channel==='blog'&&(!assets.some(a=>a.category==='copy')||assets.filter(a=>a.category==='image').length<Number(row.images)))throw new Error('원고와 계약 수량의 이미지를 등록하세요.');
  if(row.channel==='clip'&&!assets.some(a=>a.category==='video'))throw new Error('영상을 등록하세요.');
  result=update(id,{status:'approved',approvedAssets:assets.map(a=>a.id),approvedAt:new Date().toISOString(),approvedBy:actor},Number(input.version));
 }else if(action==='request-changes'){
  if(row.kind!=='tasks'||['delivered','submitted','verified'].includes(String(row.status)))throw new Error('전달 전 작업만 수정 요청할 수 있습니다.');
  result=update(id,{status:'changes',feedback:name.parse(input.feedback),approvedAssets:[]},Number(input.version));
 }else if(action==='publication'){
  if(row.kind!=='tasks'||!['delivered','submitted','verified'].includes(String(row.status)))throw new Error('자료 전달을 먼저 기록하세요.');
  const link=z.string().url().max(2048).parse(input.link);const u=new URL(link);if(!['https:','http:'].includes(u.protocol))throw new Error('웹 링크를 입력하세요.');
  if(list('tasks').some(t=>t.id!==id&&t.link===link))throw new Error('이미 등록된 게시 링크입니다.');
  result=update(id,{link,status:input.verified===true?'verified':'submitted',verifiedAt:input.verified===true?new Date().toISOString():null,verifiedBy:input.verified===true?actor:null},Number(input.version));
 }else if(action==='payout'){
  if(row.kind!=='tasks'||row.payout===null)throw new Error('지급액을 먼저 확정하세요.');result=update(id,{payoutStatus:input.paid===true?'paid':'pending',paidAt:input.paid===true?new Date().toISOString():null},Number(input.version));
 }else if(action==='cost'){
  if(row.kind!=='projects')throw new Error('프로젝트를 선택하세요.');result=create('costs',{projectId:id,category:z.enum(['ai','shipping','shooting','editing','other']).parse(input.category),amount:amount.parse(input.amount),description:name.parse(input.description),confirmed:input.confirmed===true,currency:'KRW',actor});
 }else if(action==='settle'){
  if(row.kind!=='projects'||!['completed','cancelled'].includes(String(row.status)))throw new Error('운영 완료 또는 취소 후 정산할 수 있습니다.');
  if(list('jobs').some(j=>j.projectId===id&&['pending','running','uncertain'].includes(String(j.status))))throw new Error('미완료 AI 작업의 비용을 먼저 확인하세요.');
  if(projectCosts({...row,settled:true}).provisional)throw new Error('미확정 비용을 먼저 확인하세요.');result=update(id,{settled:true,settledAt:new Date().toISOString()},Number(input.version));
 }else throw new Error('지원하지 않는 작업입니다.');
 audit(actor,action,id,{resultId:result.id});return result;
 });}


