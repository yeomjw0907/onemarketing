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
      portalParticipant().catch(() => null),
    ]);
    return Response.json(
      { admin: !!admin, advertiser: !!advertiser, participant: !!participant },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { admin: false, advertiser: false, participant: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
