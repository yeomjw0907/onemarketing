import { requireActor, sameOrigin } from "@/lib/auth";
import { view } from "@/lib/db";
import { save, command } from "@/lib/domain";
import { activeStatuses } from "@/lib/jobs";
import { scheduleTick } from "@/lib/trigger";
import { kinds, type Kind } from "@/lib/types";
import { requireConfirmedProduct } from "@/lib/product-understanding";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() {
  try {
    await requireActor();
    const data = await view();
    await Promise.all(
      data.projects.map(async (p) => {
        try {
          await requireConfirmedProduct(p);
          p.productUnderstandingCurrent = true;
        } catch {
          p.productUnderstandingCurrent = false;
        }
      }),
    );
    // 화면 새로고침마다 미처리 작업이 있으면 백그라운드 실행을 이어간다.
    if (
      data.jobs.some((j) =>
        activeStatuses.slice(0, 2).includes(String(j.status)),
      )
    )
      scheduleTick();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const email = await requireActor();
    const body = await request.json();
    if (body.action) {
      const result = await command(body.action, body.data, email, body.key);
      if (body.action === "resume-job") scheduleTick(true);
      return Response.json(result);
    }
    if (!kinds.includes(body.kind as Kind))
      throw new Error("잘못된 항목입니다.");
    return Response.json(
      await save(body.kind, body.data, email, body.id, body.version),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
