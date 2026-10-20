import { z } from "zod";
import {
  OAuthError,
  mcpOrigin,
  mcpResource,
  mcpScopes,
  ensureMcpEnabled,
} from "./mcp-oauth";
export const privateHeaders = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};
export const oauthHeaders = {
  ...privateHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};
export function oauthError(e: unknown) {
  const known = e instanceof OAuthError;
  return Response.json(
    {
      error: known ? e.code : "invalid_request",
      error_description: known
        ? e.message
        : e instanceof z.ZodError
          ? "입력 내용을 확인해주세요."
          : "요청을 처리하지 못했어요. 연결 정보를 확인해주세요.",
    },
    { status: known ? e.status : 400, headers: oauthHeaders },
  );
}
export async function boundedBody(request: Request, max = 32768) {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new OAuthError("invalid_request", "요청이 너무 큽니다.", 413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new OAuthError("invalid_request", "요청이 너무 큽니다.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function challenge(error = "invalid_token") {
  return `Bearer resource_metadata="${mcpOrigin()}/.well-known/oauth-protected-resource/api/mcp", error="${error}", error_description="Connect your Onecation administrator account.", scope="${mcpScopes.join(" ")}"`;
}
export function oauthMetadata() {
  ensureMcpEnabled();
  const base = mcpOrigin();
  return {
    issuer: base,
    authorization_endpoint: base + "/oauth/authorize",
    token_endpoint: base + "/oauth/token",
    registration_endpoint: base + "/oauth/register",
    revocation_endpoint: base + "/oauth/revoke",
    scopes_supported: mcpScopes,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };
}
export function protectedMetadata() {
  ensureMcpEnabled();
  return {
    resource: mcpResource(),
    authorization_servers: [mcpOrigin()],
    scopes_supported: mcpScopes,
    bearer_methods_supported: ["header"],
    resource_name: "원케이션 운영 연결",
  };
}
