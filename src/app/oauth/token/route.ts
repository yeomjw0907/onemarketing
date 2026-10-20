import { exchangeMcpToken, mcpRateLimit, OAuthError } from "@/lib/mcp-oauth";
import { boundedBody, oauthError, oauthHeaders } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  try {
    await mcpRateLimit(
      "token:" + (r.headers.get("x-forwarded-for") || "unknown"),
      120,
    );
    if (
      !r.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      throw new OAuthError("invalid_request", "폼 형식으로 요청해주세요.");
    return Response.json(
      await exchangeMcpToken(new URLSearchParams(await boundedBody(r))),
      { headers: oauthHeaders },
    );
  } catch (e) {
    return oauthError(e);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthHeaders });
}
