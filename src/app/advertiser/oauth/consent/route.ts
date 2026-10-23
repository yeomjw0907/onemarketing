import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { approveMcpAuthorization } from "@/lib/advertiser-oauth";
import { boundedBody, privateHeaders } from "@/lib/mcp-http";
import { advertiserOAuthError } from "@/lib/advertiser-oauth-http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const jar = await cookies(),
      a = await advertiserSession(jar.get("om_advertiser")?.value);
    if (!a) throw new Error("광고주 로그인이 필요합니다.");
    const b = JSON.parse(await boundedBody(req, 4096));
    if (typeof b.request !== "string" || typeof b.allow !== "boolean")
      throw new Error("잘못된 동의 요청입니다.");
    const redirect = await approveMcpAuthorization(
      b.request,
      jar.get("om_advertiser_oauth_consent")?.value || "",
      a.id,
      b.allow,
    );
    jar.delete("om_advertiser_oauth_consent");
    return Response.json({ redirect }, { headers: privateHeaders });
  } catch (e) {
    return advertiserOAuthError(e);
  }
}
