import { clipDescription } from "@/lib/clip-description";
import { requireActor } from "@/lib/auth";
import { requireRecord } from "@/lib/domain";
import { bytes } from "@/lib/assets";
import { publishableCopy } from "@/lib/copy-format";
export const dynamic = "force-dynamic";
// 비공개 버킷의 파일은 관리자 세션을 확인한 서버가 service role로 읽어 전달한다. 클라이언트에 키나 서명 URL을 주지 않는다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireActor();
    const a = await requireRecord((await params).id, "assets");
    if (
      a.category === "copy" &&
      new URL(request.url).searchParams.get("publishable") === "1"
    ) {
      const task = a.taskId
        ? await requireRecord(String(a.taskId), "tasks")
        : null;
      const text =
        task?.channel === "clip"
          ? clipDescription(String(a.text || "")).text
          : publishableCopy(String(a.text || ""));
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("원고.txt")}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const inline =
      String(a.mime).startsWith("image/") || a.mime === "video/mp4";
    return new Response(new Uint8Array(await bytes(a)), {
      headers: {
        "Content-Type": String(a.mime),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(String(a.name))}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "파일을 찾을 수 없거나 접근할 수 없습니다." },
      { status: 404 },
    );
  }
}
