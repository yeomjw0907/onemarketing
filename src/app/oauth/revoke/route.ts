import { revokeMcpToken, mcpRateLimit } from "@/lib/mcp-oauth";
import { boundedBody, oauthError, oauthHeaders } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  try {
    await mcpRateLimit(
      "revoke:" + (r.headers.get("x-forwarded-for") || "unknown"),
      120,
    );
    const p = new URLSearchParams(await boundedBody(r));
    await revokeMcpToken(p.get("token") || "", p.get("client_id") || "");
    return Response.json({}, { headers: oauthHeaders });
  } catch (e) {
    return oauthError(e);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthHeaders });
}
