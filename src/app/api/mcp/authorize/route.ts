import { cookies } from "next/headers";
import { requireActor, sameOrigin } from "@/lib/auth";
import { approveMcpAuthorization } from "@/lib/mcp-oauth";
import { boundedBody, oauthError, privateHeaders } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const email = await requireActor();
    const b = JSON.parse(await boundedBody(r));
    if (typeof b.request !== "string" || typeof b.allow !== "boolean")
      throw new Error("입력값을 확인해주세요.");
    const jar = await cookies();
    const redirect = await approveMcpAuthorization(
      b.request,
      jar.get("om_oauth_consent")?.value || "",
      email,
      b.allow,
    );
    jar.delete("om_oauth_consent");
    return Response.json({ redirect }, { headers: privateHeaders });
  } catch (e) {
    return oauthError(e);
  }
}
