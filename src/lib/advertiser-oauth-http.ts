import {
  mcpOrigin,
  mcpResource,
  mcpScopes,
  OAuthError,
  ensureMcpEnabled,
} from "./advertiser-oauth";
import { oauthHeaders } from "./mcp-http";
export function advertiserChallenge(scope = "campaigns:read") {
  return `Bearer resource_metadata="${mcpOrigin()}/.well-known/oauth-protected-resource/api/advertiser-mcp", scope="${scope}"`;
}
export function advertiserOAuthError(e: unknown) {
  return Response.json(
    {
      error: e instanceof OAuthError ? e.code : "invalid_request",
      error_description:
        e instanceof OAuthError
          ? e.message
          : "연결 요청을 처리하지 못했습니다.",
    },
    { status: e instanceof OAuthError ? e.status : 400, headers: oauthHeaders },
  );
}
export function advertiserMetadata() {
  ensureMcpEnabled();
  const issuer = mcpOrigin() + "/advertiser";
  return {
    issuer,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: issuer + "/oauth/authorize",
    token_endpoint: issuer + "/oauth/token",
    registration_endpoint: issuer + "/oauth/register",
    revocation_endpoint: issuer + "/oauth/revoke",
    scopes_supported: mcpScopes,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };
}
export function advertiserProtectedMetadata() {
  ensureMcpEnabled();
  return {
    resource: mcpResource(),
    authorization_servers: [mcpOrigin() + "/advertiser"],
    scopes_supported: mcpScopes,
    bearer_methods_supported: ["header"],
    resource_name: "원마케팅 광고주 캠페인",
    resource_documentation: mcpOrigin() + "/ai",
  };
}
