import { cookies } from "next/headers";
import { actor } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { portalParticipant } from "@/lib/portal";
import { campaignCatalog, campaignDetails } from "@/lib/campaign-discovery";
import { type CommerceActor } from "@/lib/commerce";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json(await campaignCatalog(), { headers });
    if (!/^[a-f0-9-]{36}$/i.test(id))
      return Response.json(
        { error: "캠페인을 찾을 수 없습니다." },
        { status: 404, headers },
      );
    let viewer: CommerceActor | null = null;
    const admin = await actor();
    const participant = await portalParticipant().catch(() => null);
    const advertiser = await advertiserSession(
      (await cookies()).get("om_advertiser")?.value,
    );
    if (admin) viewer = { role: "admin", id: admin };
    else if (participant) viewer = { role: "participant", id: participant.id };
    else if (advertiser) viewer = { role: "advertiser", id: advertiser.id };
    const result = await campaignDetails(id, viewer);
    return result
      ? Response.json(result, { headers })
      : Response.json(
          { error: "캠페인을 찾을 수 없거나 공개가 종료됐습니다." },
          { status: 404, headers },
        );
  } catch {
    return Response.json(
      { error: "캠페인을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 503, headers },
    );
  }
}
