import { requireActor, sameOrigin } from "@/lib/auth";
import { list } from "@/lib/db";
import { reviewKakaoLink } from "@/lib/kakao-auth";
export async function GET() {
  try {
    await requireActor();
    return Response.json(
      (await list("portal_links"))
        .filter(
          (l) => l.purpose === "kakao-link-request" && l.status === "pending",
        )
        .map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          nickname: l.nickname,
          candidateId: l.candidateId,
          createdAt: l.createdAt,
        })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor(),
      b = await request.json();
    await reviewKakaoLink(
      String(b.id),
      String(b.participantId),
      b.approve === true,
      String(b.evidence || ""),
      actor,
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "처리 실패" },
      { status: 400 },
    );
  }
}
