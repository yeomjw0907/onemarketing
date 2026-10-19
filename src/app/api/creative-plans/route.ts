import { requireActor, sameOrigin } from "@/lib/auth";
import { reviewCreative } from "@/lib/creative-plans";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    return Response.json(await reviewCreative(await request.json(), actor));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "시나리오 검토 실패" },
      { status: 400 },
    );
  }
}
