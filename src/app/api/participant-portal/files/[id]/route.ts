import { portalParticipant } from "@/lib/portal";
import { get, list } from "@/lib/db";
import { bytes } from "@/lib/assets";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const p = await portalParticipant();
    const { id } = await params;
    const a = await get(id);
    if (a?.kind !== "assets" || !a.taskId || a.current !== true)
      return new Response("파일 없음", { status: 404 });
    const t = await get(String(a.taskId));
    if (
      t?.participantId !== p.id ||
      !["delivered", "submitted", "verified"].includes(String(t.status)) ||
      !((t.approvedAssets as string[]) || []).includes(a.id)
    )
      return new Response("접근 불가", { status: 403 });
    return new Response(new Uint8Array(await bytes(a)), {
      headers: {
        "Content-Type": String(a.mime || "application/octet-stream"),
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(String(a.name)),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("로그인 필요", { status: 401 });
  }
}
