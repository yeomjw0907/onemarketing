import {
  assistantDevice,
  heartbeatAssistant,
  claimAssistant,
  completeAssistant,
  failAssistant,
} from "@/lib/assistant-chat";
import { boundedBody, privateHeaders } from "@/lib/mcp-http";
import { mcpRateLimit } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(r: Request) {
  let device;
  try {
    const token = r.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new Error();
    device = await assistantDevice(token);
  } catch {
    return Response.json(
      { error: "PC 연결 인증이 필요해요." },
      { status: 401, headers: privateHeaders },
    );
  }
  try {
    await mcpRateLimit("assistant-worker:" + device.id, 180);
    const b = JSON.parse(await boundedBody(r, 70000));
    let result;
    if (b.action === "heartbeat")
      result = await heartbeatAssistant(device, b.status, b.id, b.lease);
    else if (b.action === "claim") result = await claimAssistant(device);
    else if (b.action === "complete")
      result = await completeAssistant(device, {
        id: b.id,
        lease: b.lease,
        output: b.output,
      });
    else if (b.action === "fail") {
      await failAssistant(device, b.id, b.lease, b.reason);
      result = { ok: true };
    } else throw new Error("지원하지 않는 작업이에요.");
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "처리하지 못했어요." },
      { status: 400, headers: privateHeaders },
    );
  }
}
