import { protectedMetadata, oauthHeaders, oauthError } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    return Response.json(protectedMetadata(), { headers: oauthHeaders });
  } catch (e) {
    return oauthError(e);
  }
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: oauthHeaders });
}
