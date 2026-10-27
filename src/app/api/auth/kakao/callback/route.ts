import { advertiserKakaoLogin } from "@/lib/advertiser-social";
import { cookies } from "next/headers";
import { completeKakao, kakaoOnboarding } from "@/lib/kakao-auth";
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
    if (result.advertiserIdentity) {
      const login = await advertiserKakaoLogin(result.advertiserIdentity);
      if (login) {
        store.set("om_advertiser", login.token, {
          ...options,
          maxAge: 7 * 86400,
        });
        destination.pathname = "/advertisers";
      } else {
        store.delete("om_advertiser");
        destination.pathname = "/login";
        destination.search = "?role=advertiser&signup=1";
      }
      store.delete("om_advertiser_kakao_pending");
      if (!login)
        store.set("om_advertiser_kakao_pending", result.advertiserIdentity, {
          ...options,
          maxAge: 1800,
        });
      store.delete("om_kakao_role");
      store.delete("om_kakao_state");
      store.delete("om_kakao_silent");
      return new Response(null, {
        status: 303,
        headers: {
          Location: destination.toString(),
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
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
      const onboarding = await kakaoOnboarding(result.identity);
      if (
        onboarding.status !== "application_pending" &&
        onboarding.status !== "approved"
      ) {
        destination.pathname = "/participants/apply";
        destination.searchParams.set("kakao", "1");
      }
    }
  } catch {
    if (store.get("om_kakao_role")?.value === "advertiser") {
      destination.pathname = "/login";
      destination.searchParams.set("role", "advertiser");
    }
    if (store.get("om_kakao_silent")?.value === "1")
      destination.searchParams.set("autoLogin", "skipped");
    else destination.searchParams.set("loginError", "1");
  }
  store.delete("om_kakao_role");
  store.delete("om_kakao_state");
  store.delete("om_kakao_silent");
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
