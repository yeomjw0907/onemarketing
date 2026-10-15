import { requireActor, sameOrigin } from "@/lib/auth";
import { exchangeRate } from "@/lib/exchange-rate";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() {
  try {
    await requireActor();
    return Response.json(await exchangeRate(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "환율 조회 실패" },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await requireActor();
    return Response.json(await exchangeRate(true), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "환율 조회 실패" },
      { status: 400 },
    );
  }
}
