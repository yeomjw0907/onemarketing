import { requireActor, sameOrigin } from "@/lib/auth";
import { view } from "@/lib/db";
import { save, command } from "@/lib/domain";
import { kinds, type Kind } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireActor();
    return Response.json(view(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const email = await requireActor();
    const body = await request.json();
    if (body.action)
      return Response.json(command(body.action, body.data, email, body.key));
    if (!kinds.includes(body.kind as Kind))
      throw new Error("잘못된 항목입니다.");
    return Response.json(
      save(body.kind, body.data, email, body.id, body.version),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "저장에 실패했습니다." },
      { status: 400 },
    );
  }
}
