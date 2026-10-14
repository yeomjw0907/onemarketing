import { z } from 'zod';
import { requireActor,sameOrigin } from '@/lib/auth';
import { extractSheet,saveAsset } from '@/lib/assets';
export async function POST(request:Request){try{sameOrigin(request);const actor=await requireActor();if(Number(request.headers.get('content-length'))>110*1024*1024)throw new Error('업로드 용량을 초과했습니다.');
 if(request.headers.get('content-type')?.includes('application/json')){const body=z.object({projectId:z.string(),taskId:z.string(),text:z.string().trim().min(1).max(100000)}).parse(await request.json());return Response.json(saveAsset({...body,category:'copy',name:'원고.md',buffer:Buffer.from(body.text,'utf8')},actor));}
 const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||file.size===0)throw new Error('빈 파일입니다.');
 const category=z.enum(['source','image','video']).parse(form.get('category'));const max=category==='video'?100:category==='source'&&/\.(xlsx|csv)$/i.test(file.name)?10:20;if(file.size>max*1024*1024)throw new Error(`파일당 최대 ${max}MB까지 지원합니다.`);
 const buffer=Buffer.from(await file.arrayBuffer());const ext=file.name.split('.').pop()?.toLowerCase()||'';const extracted=await extractSheet(buffer,ext);
 return Response.json(saveAsset({projectId:z.string().min(1).parse(form.get('projectId')),taskId:form.get('taskId')?String(form.get('taskId')):undefined,category,name:file.name,buffer,extracted},actor));
 }catch(e){return Response.json({error:e instanceof Error?e.message:'파일 등록에 실패했습니다.'},{status:400});}}
