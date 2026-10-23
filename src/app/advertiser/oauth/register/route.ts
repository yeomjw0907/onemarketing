import { advertiserOAuthError as oauthError } from "@/lib/advertiser-oauth-http";
import { registerMcpClient, mcpRateLimit } from "@/lib/advertiser-oauth";
import { boundedBody, oauthHeaders } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  try {
    await mcpRateLimit(
      "register:" + (r.headers.get("x-forwarded-for") || "unknown"),
      20,
      3600000,
    );
    await mcpRateLimit("register-global", 100, 3600000);
    return Response.json(
      await registerMcpClient(JSON.parse(await boundedBody(r))),
      { status: 201, headers: oauthHeaders },
    );
  } catch (e) {
    return oauthError(e);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthHeaders });
}
