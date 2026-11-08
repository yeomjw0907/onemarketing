import { actor } from "@/lib/auth";
import { funnelRange } from "@/lib/funnel-metrics";
import { platformFunnel } from "@/lib/platform-funnel";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  if (!(await actor()))
    return Response.json(
      { error: "관리자 로그인이 필요합니다." },
      { status: 401, headers },
    );
  const params = new URL(request.url).searchParams;
  let range;
  try {
    range = funnelRange(
      params.get("from") || "",
      params.get("to") || "",
      Number(params.get("window")),
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 400, headers },
    );
  }
  try {
    return Response.json(await platformFunnel(range), { headers });
  } catch {
    return Response.json(
      { error: "진행률을 불러오지 못했습니다. 잠시 후 다시 조회해주세요." },
      { status: 503, headers },
    );
  }
}
