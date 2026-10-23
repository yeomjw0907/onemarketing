import { mcpConnections, revokeMcpGrant } from "@/lib/advertiser-oauth";
import { cookies } from "next/headers";
import { advertiserSession } from "@/lib/market";
import { sameOrigin } from "@/lib/auth";
import { boundedBody } from "@/lib/mcp-http";
import {
  createAdvertiserKey,
  listAdvertiserKeys,
  revokeAdvertiserKey,
} from "@/lib/advertiser-ai";
const headers = { "Cache-Control": "private, no-store" };
async function identity() {
  const a = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  if (!a) throw new Error("광고주 로그인이 필요합니다.");
  return a.id;
}
function fail(e: unknown) {
  return Response.json(
    { error: e instanceof Error ? e.message : "요청 실패" },
    {
      status: e instanceof Error && e.message.includes("로그인") ? 401 : 400,
      headers,
    },
  );
}
export async function GET() {
  try {
    const id = await identity();
    return Response.json(
      [
        ...(await listAdvertiserKeys(id)),
        ...(await mcpConnections(id)).map((r) => ({ ...r, label: r.name })),
      ],
      { headers },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const id = await identity(),
      b = JSON.parse(await boundedBody(req, 4096));
    if (b.action === "create")
      return Response.json(await createAdvertiserKey(id, b.label), { headers });
    if (b.action === "oauth-revoke") {
      await revokeMcpGrant(b.id, id);
      return Response.json({ ok: true }, { headers });
    }
    if (b.action === "revoke") {
      await revokeAdvertiserKey(id, b.id);
      return Response.json({ ok: true }, { headers });
    }
    throw new Error("작업을 확인하세요.");
  } catch (e) {
    return fail(e);
  }
}
