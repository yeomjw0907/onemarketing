import { requireActor, sameOrigin } from "@/lib/auth";
import { issueReportLink, revokeReportLink } from "@/lib/customer-reports";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    const body = z
      .object({
        customerId: z.string().uuid(),
        days: z.number().int().min(1).max(365).default(90),
        revokeId: z.string().uuid().optional(),
      })
      .parse(await request.json());
    if (body.revokeId) {
      await revokeReportLink(body.customerId, body.revokeId, actor);
      return Response.json({ ok: true });
    }
    const link = await issueReportLink(body.customerId, body.days, actor);
    const origin = new URL(process.env.APP_URL || request.url).origin;
    return Response.json(
      {
        linkId: link.linkId,
        expiresAt: link.expiresAt,
        url: `${origin}/reports/${link.token}`,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "링크 처리 실패" },
      { status: 400 },
    );
  }
}
