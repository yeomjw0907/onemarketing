import { requireActor, sameOrigin } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { scheduleTick } from "@/lib/trigger";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    const job = await enqueue(await request.json(), actor);
    // 등록 직후 같은 함수 실행에서 작업을 시작한다. 브라우저를 닫아도 서버에서 계속 진행된다.
    scheduleTick(true);
    return Response.json(job);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "작업 등록 실패" },
      { status: 400 },
    );
  }
}
