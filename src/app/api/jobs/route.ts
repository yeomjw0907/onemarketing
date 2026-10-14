import { requireActor,sameOrigin } from '@/lib/auth';
import { enqueue } from '@/lib/jobs';
export async function POST(request:Request){try{sameOrigin(request);const actor=await requireActor();return Response.json(enqueue(await request.json(),actor));}catch(e){return Response.json({error:e instanceof Error?e.message:'작업 등록 실패'},{status:400});}}
