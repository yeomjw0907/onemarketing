import { z } from "zod";
import { requireActor, sameOrigin } from "@/lib/auth";
import { refreshKeywordMetrics } from "@/lib/keyword-metrics";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    const body = z
      .object({
        projectId: z.string().uuid(),
        version: z.number().int().positive(),
      })
      .parse(await request.json());
    return Response.json(
      await refreshKeywordMetrics(body.projectId, body.version, actor),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "네이버 데이터 조회 실패",
      },
      { status: 400 },
    );
  }
}
