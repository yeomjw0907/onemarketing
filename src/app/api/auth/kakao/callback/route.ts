import { advertiserKakaoLogin } from "@/lib/advertiser-social";
import { cookies } from "next/headers";
import { completeKakao, kakaoOnboarding } from "@/lib/kakao-auth";
import { socialSignupPath } from "@/lib/social-referral";
import {
  applyAdvertiserReturn,
  applyParticipantReturn,
  safeParticipantPortalReturn,
} from "@/lib/login-entry";
import { safeLoginReturnPath } from "@/lib/login-entry";
export async function GET(request: Request) {
  const url = new URL(request.url),
    store = await cookies();
  const destination = new URL("/participants/portal", process.env.APP_URL!);
  const next =
    safeLoginReturnPath(store.get("om_kakao_next")?.value) ||
    safeParticipantPortalReturn(store.get("om_kakao_next")?.value);
  store.delete("om_kakao_next");
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
        applyAdvertiserReturn(destination, next);
      } else {
        store.delete("om_advertiser");
        destination.pathname = "/login";
        destination.search = "?role=advertiser&signup=1";
        if (next) destination.searchParams.set("next", next);
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
    if (result.session) {
      store.set("om_participant", result.session, {
        ...options,
        maxAge: 30 * 86400,
      });
      applyParticipantReturn(destination, next);
    }
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
        const signup = new URL(
          socialSignupPath("kakao", result.referralCode),
          destination,
        );
        destination.pathname = signup.pathname;
        destination.search = signup.search;
      }
    }
  } catch {
    if (store.get("om_kakao_role")?.value !== "advertiser")
      applyParticipantReturn(destination, next);
    if (store.get("om_kakao_role")?.value === "advertiser") {
      destination.pathname = "/login";
      destination.searchParams.set("role", "advertiser");
      if (next) destination.searchParams.set("next", next);
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
