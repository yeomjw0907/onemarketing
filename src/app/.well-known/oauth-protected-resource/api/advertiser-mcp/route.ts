import {
  advertiserProtectedMetadata,
  advertiserOAuthError,
} from "@/lib/advertiser-oauth-http";
import { oauthHeaders } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return Response.json(advertiserProtectedMetadata(), {
      headers: oauthHeaders,
    });
  } catch (e) {
    return advertiserOAuthError(e);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthHeaders });
}
