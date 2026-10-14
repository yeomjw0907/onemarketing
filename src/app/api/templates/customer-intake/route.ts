import { requireActor } from "@/lib/auth";
import { customerIntakeTemplate } from "@/lib/intake-template";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireActor();
    return new Response(new Uint8Array(await customerIntakeTemplate()), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("고객_마케팅자료_작성양식_v1.xlsx")}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
}
