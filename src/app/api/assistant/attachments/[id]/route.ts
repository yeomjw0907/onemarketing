import { requireActor, sameOrigin } from "@/lib/auth";
import { readAssistantFile, deleteAssistantFile } from "@/lib/assistant-files";
import { getObject } from "@/lib/storage";
import { privateHeaders } from "@/lib/mcp-http";
export async function GET(
  _r: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const f = await readAssistantFile(
      await requireActor(),
      (await ctx.params).id,
    );
    return new Response(new Uint8Array(await getObject(f.storage_name)), {
      headers: {
        ...privateHeaders,
        "Content-Type": f.mime,
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(f.name),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "파일을 찾을 수 없어요." },
      { status: 404, headers: privateHeaders },
    );
  }
}
export async function DELETE(
  r: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(r);
    await deleteAssistantFile(await requireActor(), (await ctx.params).id);
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "삭제하지 못했어요." },
      { status: 400, headers: privateHeaders },
    );
  }
}
