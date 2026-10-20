import { requireActor, sameOrigin } from "@/lib/auth";
import { boundedBody, privateHeaders } from "@/lib/mcp-http";
import {
  assistantStatus,
  createAssistantPairing,
  createAssistantThread,
  enqueueAssistant,
  confirmAssistant,
  dismissAssistant,
  cancelAssistant,
  disconnectAssistant,
  answerAssistantQuestion,
} from "@/lib/assistant-chat";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(r: Request) {
  try {
    const owner = await requireActor();
    return Response.json(
      await assistantStatus(
        owner,
        new URL(r.url).searchParams.get("thread") || undefined,
      ),
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: "관리자 로그인이 필요해요." },
      { status: 401, headers: privateHeaders },
    );
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const owner = await requireActor();
    const b = JSON.parse(await boundedBody(r, 16000));
    let result;
    switch (b.action) {
      case "pair":
        result = await createAssistantPairing(owner);
        break;
      case "new":
        result = await createAssistantThread(owner);
        break;
      case "message":
        result = await enqueueAssistant(owner, {
          threadId: b.threadId,
          requestId: b.requestId,
          message: b.message,
        });
        break;
      case "confirm":
        result = await confirmAssistant(owner, b.id);
        break;
      case "answer":
        result = await answerAssistantQuestion(owner, {
          id: b.id,
          requestId: b.requestId,
          values: b.values,
        });
        break;
      case "dismiss":
        await dismissAssistant(owner, b.id);
        result = { ok: true };
        break;
      case "cancel":
        await cancelAssistant(owner, b.id);
        result = { ok: true };
        break;
      case "disconnect":
        await disconnectAssistant(owner, b.id);
        result = { ok: true };
        break;
      default:
        throw new Error("지원하지 않는 작업이에요.");
    }
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "처리하지 못했어요." },
      { status: 400, headers: privateHeaders },
    );
  }
}
