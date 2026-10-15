import { requireActor, sameOrigin } from "@/lib/auth";
import { editMediaPlan } from "@/lib/media-plans";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    return Response.json(await editMediaPlan(await request.json(), actor));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "브리핑 저장 실패" },
      { status: 400 },
    );
  }
}
