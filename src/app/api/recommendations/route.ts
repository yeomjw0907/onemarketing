import {z} from 'zod';
import {requireActor,sameOrigin} from '@/lib/auth';
import {list} from '@/lib/db';
import {recommend} from '@/lib/recommendations';
export async function POST(request:Request){try{sameOrigin(request);await requireActor();const body=z.object({budget:z.number().int().positive(),discount:z.number().int().min(0).default(0)}).parse(await request.json());return Response.json(recommend(list('prices'),body.budget,body.discount));}catch(e){return Response.json({error:e instanceof Error?e.message:'추천 실패'},{status:400});}}
