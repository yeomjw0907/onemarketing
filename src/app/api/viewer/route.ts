import {
  databaseUnavailable,
  databaseUnavailableResponse,
} from "@/lib/database-errors";
import { cookies } from "next/headers";
import { actor } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { portalParticipant } from "@/lib/portal";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [admin, advertiser, participant] = await Promise.all([
      actor(),
      advertiserSession((await cookies()).get("om_advertiser")?.value),
      portalParticipant().catch((e) => {
        if (databaseUnavailable(e)) throw e;
        return null;
      }),
    ]);
    return Response.json(
      { admin: !!admin, advertiser: !!advertiser, participant: !!participant },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    if (databaseUnavailable(e)) return databaseUnavailableResponse();
    return Response.json(
      { error: "로그인 상태를 확인하지 못했어요. 다시 시도해주세요." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
