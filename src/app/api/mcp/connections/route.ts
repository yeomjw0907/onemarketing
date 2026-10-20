import { requireActor, sameOrigin } from "@/lib/auth";
import { revokeMcpGrant } from "@/lib/mcp-oauth";
import { boundedBody, oauthError, privateHeaders } from "@/lib/mcp-http";
export const dynamic = "force-dynamic";
export async function DELETE(r: Request) {
  try {
    sameOrigin(r);
    const email = await requireActor();
    const b = JSON.parse(await boundedBody(r));
    if (typeof b.id !== "string") throw new Error("연결을 선택해주세요.");
    await revokeMcpGrant(b.id, email);
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return oauthError(e);
  }
}
