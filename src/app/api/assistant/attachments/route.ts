import { requireActor, sameOrigin } from "@/lib/auth";
import { uploadAssistantFile } from "@/lib/assistant-files";
import { privateHeaders } from "@/lib/mcp-http";
export const maxDuration = 120;
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const owner = await requireActor();
    if (Number(r.headers.get("content-length")) > 4 * 1024 * 1024 + 65536)
      throw new Error("파일은 4MB 이하로 첨부해주세요.");
    const form = await r.formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw new Error("파일을 선택해주세요.");
    return Response.json(
      await uploadAssistantFile(
        owner,
        String(form.get("threadId") || ""),
        file.name,
        Buffer.from(await file.arrayBuffer()),
      ),
      { headers: privateHeaders },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "첨부하지 못했어요." },
      { status: 400, headers: privateHeaders },
    );
  }
}
