import { publishableCopy } from "@/lib/copy-format";
import { clipDescription } from "@/lib/clip-description";
import { cookies } from "next/headers";
import { actor } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { portalParticipant } from "@/lib/portal";
import { get, query } from "@/lib/db";
import { bytes } from "@/lib/assets";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const a = await get(id);
    if (
      a?.kind !== "assets" ||
      a.current !== true ||
      !["copy", "image", "video"].includes(String(a.category))
    )
      return new Response("파일 없음", { status: 404 });
    const admin = await actor();
    if (!admin) {
      const advertiser = await advertiserSession(
        (await cookies()).get("om_advertiser")?.value,
      );
      const participant = await portalParticipant().catch(() => null);
      const allowed = await query(
        "select a.id from commerce_applications a join commerce_campaigns c on c.id=a.campaign_id join commerce_orders o on o.id=c.order_id where a.data->'materials'->'assetIds' ? $1 and c.data->>'projectId'=$2 and (o.advertiser_id::text=$3 or a.participant_id=$4)",
        [id, String(a.projectId), advertiser?.id || "", participant?.id || ""],
      );
      if (!allowed.length) return new Response("접근 불가", { status: 403 });
    }
    if (a.category === "copy") {
      const task = a.taskId ? await get(String(a.taskId)) : null;
      const copy =
        task?.channel === "clip"
          ? clipDescription(String(a.text || "")).text
          : publishableCopy(String(a.text || ""));
      return new Response(copy, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition":
            "attachment; filename*=UTF-8''" + encodeURIComponent("원고.txt"),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return new Response(new Uint8Array(await bytes(a)), {
      headers: {
        "Content-Type": String(a.mime || "application/octet-stream"),
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(String(a.name)),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("접근할 수 없는 파일입니다.", { status: 404 });
  }
}
