import { requireActor, sameOrigin } from "@/lib/auth";
import { syncFalBilling } from "@/lib/fal-billing";
import { z } from "zod";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await requireActor();
    const body = z
      .object({ projectId: z.string().min(1).optional() })
      .parse(await request.json());
    return Response.json(await syncFalBilling(body.projectId));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "청구 조회 실패" },
      { status: 400 },
    );
  }
}
