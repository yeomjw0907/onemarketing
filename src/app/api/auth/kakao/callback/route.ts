import { cookies } from "next/headers";
import { completeKakao } from "@/lib/kakao-auth";
export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies();
  const destination = new URL("/participants/portal", process.env.APP_URL!);
  try {
    if (url.searchParams.has("error"))
      throw new Error("로그인이 취소되었어요.");
    const result = await completeKakao(
      url.searchParams.get("state") || "",
      store.get("om_kakao_state")?.value || "",
      url.searchParams.get("code") || "",
    );
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };
    store.delete("om_kakao_pending");
    if (result.session)
      store.set("om_participant", result.session, {
        ...options,
        maxAge: 30 * 86400,
      });
    if (result.identity) {
      store.delete("om_participant");
      store.set("om_kakao_pending", result.identity, {
        ...options,
        maxAge: 1800,
      });
    }
  } catch {
    destination.searchParams.set("loginError", "1");
  }
  store.delete("om_kakao_state");
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
