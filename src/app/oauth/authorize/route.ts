import {
  beginMcpAuthorization,
  mcpOrigin,
  mcpRateLimit,
} from "@/lib/mcp-oauth";
import { oauthError, privateHeaders } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    await mcpRateLimit(
      "authorize:" + (r.headers.get("x-forwarded-for") || "unknown"),
      60,
    );
    const result = await beginMcpAuthorization(new URL(r.url).searchParams);
    return new Response(null, {
      status: 302,
      headers: {
        ...privateHeaders,
        Location: mcpOrigin() + "/connect/onecation?request=" + result.id,
        "Set-Cookie": `om_oauth_consent=${result.binding}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${mcpOrigin().startsWith("https:") ? "; Secure" : ""}`,
      },
    });
  } catch (e) {
    return oauthError(e);
  }
}
