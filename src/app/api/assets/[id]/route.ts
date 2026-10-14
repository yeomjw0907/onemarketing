import { requireActor } from '@/lib/auth';
import { requireRecord } from '@/lib/domain';
import { bytes } from '@/lib/assets';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{await requireActor();const a=requireRecord((await params).id,'assets');const inline=String(a.mime).startsWith('image/')||a.mime==='video/mp4';return new Response(new Uint8Array(bytes(a)),{headers:{'Content-Type':String(a.mime),'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(String(a.name))}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return Response.json({error:'파일을 찾을 수 없거나 접근할 수 없습니다.'},{status:404});}}
