import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import { additionalProvider, beginSocial } from "@/lib/social-oauth";
import {
  safeLoginReturnPath,
  safeParticipantPortalReturn,
} from "@/lib/login-entry";
export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    sameOrigin(request);
    const provider = additionalProvider((await context.params).provider);
    const raw = await request.text();
    if (raw.length > 4096) throw new Error("요청이 너무 깁니다.");
    const body = JSON.parse(raw),
      role = body.role === "advertiser" ? "advertiser" : "participant";
    const result = await beginSocial(
      provider,
      role,
      typeof body.access === "string" ? body.access : undefined,
      typeof body.referralCode === "string" ? body.referralCode : undefined,
    );
    const jar = await cookies(),
      options = {
        httpOnly: true,
        secure:
          new URL(request.url).protocol === "https:" ||
          process.env.COOKIE_SECURE === "true",
        sameSite: "lax" as const,
        path: "/",
        maxAge: 600,
      };
    jar.set(`om_${provider}_state`, result.state, options);
    jar.set(`om_${provider}_role`, role, options);
    jar.set(
      `om_${provider}_next`,
      role === "advertiser"
        ? safeLoginReturnPath(body.next)
        : safeParticipantPortalReturn(body.next),
      options,
    );
    return Response.json(
      { url: result.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
