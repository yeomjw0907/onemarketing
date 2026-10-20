import { pairAssistantDevice } from "@/lib/assistant-chat";
import { boundedBody, privateHeaders } from "@/lib/mcp-http";
import { mcpRateLimit } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  try {
    await mcpRateLimit(
      "assistant-pair-ip:" + (r.headers.get("x-forwarded-for") || "unknown"),
      20,
      3600000,
    );
    return Response.json(
      await pairAssistantDevice(JSON.parse(await boundedBody(r, 4096))),
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      {
        error:
          "연결 코드를 확인해주세요. 만료됐다면 대시보드에서 다시 발급해주세요.",
      },
      { status: 400, headers: privateHeaders },
    );
  }
}
