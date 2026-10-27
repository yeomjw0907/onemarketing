import {
  databaseUnavailable,
  databaseUnavailableResponse,
} from "@/lib/database-errors";
import { kakaoConfigured } from "@/lib/kakao-auth";
import {
  advertiserKakaoPending,
  advertiserKakaoLogin,
} from "@/lib/advertiser-social";
import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import {
  advertiserAuth,
  advertiserLogout,
  advertiserSession,
} from "@/lib/market";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const jar = await cookies();
    let pending = false;
    try {
      await advertiserKakaoPending(
        jar.get("om_advertiser_kakao_pending")?.value || "",
      );
      pending = true;
    } catch (e) {
      if (databaseUnavailable(e)) throw e;
    }
    return Response.json(
      {
        kakaoEnabled: kakaoConfigured(),
        kakaoPending: pending,
        account: await advertiserSession(
          (await cookies()).get("om_advertiser")?.value,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    if (databaseUnavailable(e)) return databaseUnavailableResponse();
    return Response.json(
      { error: "로그인 상태를 확인하지 못했어요. 다시 시도해주세요." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const raw = await request.text();
    if (raw.length > 16000) throw new Error("요청이 너무 깁니다.");
    const b = JSON.parse(raw);
    const jar = await cookies();
    if (b.action === "logout") {
      await advertiserLogout(jar.get("om_advertiser")?.value);
      jar.delete("om_advertiser");
      jar.delete("om_advertiser_kakao_pending");
      return Response.json({ ok: true });
    }
    const pendingIdentity = jar.get("om_advertiser_kakao_pending")?.value;
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const result =
      b.action === "social-register" || b.action === "social-link"
        ? await advertiserKakaoLogin(pendingIdentity || "", b, ip)
        : await advertiserAuth(
            b,
            request.headers
              .get("x-vercel-forwarded-for")
              ?.split(",")[0]
              ?.trim() ||
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
              "unknown",
          );
    if (!result) throw new Error("카카오 로그인을 다시 진행해주세요.");
    jar.delete("om_advertiser_kakao_pending");
    jar.set("om_advertiser", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        new URL(request.url).protocol === "https:" ||
        process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 7 * 86400,
    });
    return Response.json({ account: result.account });
  } catch (e) {
    if (databaseUnavailable(e)) return databaseUnavailableResponse();
    return Response.json(
      {
        error:
          e instanceof ZodError
            ? e.issues[0]?.message
            : e instanceof Error
              ? e.message
              : "로그인하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
