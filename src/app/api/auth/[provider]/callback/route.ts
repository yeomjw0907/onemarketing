import { cookies } from "next/headers";
import { additionalProvider, completeSocial } from "@/lib/social-oauth";
import { advertiserKakaoLogin } from "@/lib/advertiser-social";
import { kakaoOnboarding } from "@/lib/kakao-auth";
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const jar = await cookies(),
    destination = new URL("/participants/portal", process.env.APP_URL!);
  let provider: "google" | "naver";
  try {
    provider = additionalProvider((await context.params).provider);
  } catch {
    return new Response(null, { status: 404 });
  }
  const options = {
    httpOnly: true,
    secure:
      destination.protocol === "https:" || process.env.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    path: "/",
  };
  try {
    const url = new URL(request.url);
    if (url.searchParams.has("error")) throw new Error("cancelled");
    const result = await completeSocial(
      provider,
      url.searchParams.get("state") || "",
      jar.get(`om_${provider}_state`)?.value || "",
      url.searchParams.get("code") || "",
    );
    // Legacy pending-cookie names remain shared with Kakao for onboarding compatibility.
    jar.delete("om_advertiser_kakao_pending");
    jar.delete("om_kakao_pending");
    if (result.advertiserIdentity) {
      const login = await advertiserKakaoLogin(result.advertiserIdentity);
      if (login) {
        jar.set("om_advertiser", login.token, {
          ...options,
          maxAge: 7 * 86400,
        });
        destination.pathname = "/advertisers";
      } else {
        jar.delete("om_advertiser");
        jar.set("om_advertiser_kakao_pending", result.advertiserIdentity, {
          ...options,
          maxAge: 1800,
        });
        destination.pathname = "/login";
        destination.search = "?role=advertiser&signup=1";
      }
    } else if (result.session)
      jar.set("om_participant", result.session, {
        ...options,
        maxAge: 30 * 86400,
      });
    else if (result.identity) {
      jar.delete("om_participant");
      jar.set("om_kakao_pending", result.identity, {
        ...options,
        maxAge: 1800,
      });
      const onboarding = await kakaoOnboarding(result.identity);
      if (
        onboarding.status !== "application_pending" &&
        onboarding.status !== "approved"
      ) {
        destination.pathname = "/participants/apply";
        destination.search = "?social=1";
      }
    }
  } catch {
    if (jar.get(`om_${provider}_role`)?.value === "advertiser") {
      destination.pathname = "/login";
      destination.search = "?role=advertiser";
    }
    destination.searchParams.set("loginError", "1");
  }
  jar.delete(`om_${provider}_state`);
  jar.delete(`om_${provider}_role`);
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
