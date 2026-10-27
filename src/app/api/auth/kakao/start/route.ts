import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import { beginKakao } from "@/lib/kakao-auth";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    const silent =
      body.silent === true &&
      body.reselect !== true &&
      /KAKAOTALK/i.test(request.headers.get("user-agent") || "");
    const result = await beginKakao(
      typeof body.access === "string" ? body.access : undefined,
      body.reselect === true,
      silent,
      body.role === "advertiser" ? "advertiser" : "participant",
    );
    (await cookies()).set(
      "om_kakao_role",
      body.role === "advertiser" ? "advertiser" : "participant",
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      },
    );
    (await cookies()).set("om_kakao_state", result.state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    (await cookies()).set("om_kakao_silent", silent ? "1" : "0", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return Response.json(
      { url: result.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "로그인을 다시 시도해주세요." },
      { status: 400 },
    );
  }
}
