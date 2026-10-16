import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import {
  pendingKakao,
  requestKakaoLink,
  issueKakaoSession,
  kakaoConfigured,
} from "@/lib/kakao-auth";
import { list } from "@/lib/db";
export async function GET() {
  const identity = (await cookies()).get("om_kakao_pending")?.value;
  let pending = null;
  if (identity)
    try {
      const r = await pendingKakao(identity);
      const requests = (await list("portal_links")).filter(
        (l) => l.purpose === "kakao-link-request" && l.kakaoId === r.kakaoId,
      );
      pending = {
        nickname: r.nickname,
        hasCandidate: !!r.candidateId,
        status: requests.sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        )[0]?.status,
      };
    } catch {}
  return Response.json(
    { enabled: kakaoConfigured(), pending },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const b = await request.json(),
      store = await cookies(),
      identity = store.get("om_kakao_pending")?.value || "";
    const r = await pendingKakao(identity);
    if (b.action === "continue") {
      const binding = (await list("portal_links")).find(
        (l) =>
          l.purpose === "kakao-account" &&
          l.kakaoId === r.kakaoId &&
          !l.revokedAt,
      );
      if (!binding) throw new Error("담당자가 연결 요청을 확인 중이에요.");
      const session = await issueKakaoSession(String(binding.participantId));
      store.set("om_participant", session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 86400,
      });
      store.delete("om_kakao_pending");
    } else if (b.action === "request")
      await requestKakaoLink(
        identity,
        String(b.name || ""),
        String(b.phone || ""),
      );
    else throw new Error("잘못된 요청이에요.");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "처리하지 못했어요." },
      { status: 400 },
    );
  }
}
