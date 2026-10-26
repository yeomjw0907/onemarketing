import { cookies } from "next/headers";
import { requireActor, sameOrigin } from "@/lib/auth";
import { portalParticipant } from "@/lib/portal";
import {
  advertiserSession,
  publicProducts,
  publicCampaigns,
  orderProduct,
  advertiserOrders,
  applyCampaign,
  myApplications,
  withdrawApplication,
  marketAdmin,
  marketAdminView,
} from "@/lib/market";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
async function advertiser() {
  const a = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  if (!a) throw new Error("광고주 로그인이 필요합니다.");
  return a;
}
function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof ZodError
          ? e.issues[0]?.message
          : e instanceof Error
            ? e.message
            : "처리하지 못했습니다.",
    },
    {
      status:
        e instanceof Error &&
        /로그인이 필요|유효한 접속 링크|접속 링크가 필요/.test(e.message)
          ? 401
          : 400,
      headers,
    },
  );
}
export async function GET(request: Request) {
  try {
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode === "admin") {
      await requireActor();
      return Response.json(await marketAdminView(), { headers });
    }
    if (mode === "orders") {
      const a = await advertiser();
      return Response.json(await advertiserOrders(a.id), { headers });
    }
    if (mode === "applications") {
      const p = await portalParticipant();
      return Response.json(await myApplications(p.id), { headers });
    }
    if (mode === "catalog") {
      await advertiser();
      return Response.json(await publicProducts(), { headers });
    }
    if (mode === "campaigns")
      return Response.json(await publicCampaigns(), { headers });
    return Response.json(
      { error: "잘못된 요청입니다." },
      { status: 400, headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const raw = await request.text();
    if (raw.length > 24000) throw new Error("신청 내용이 너무 깁니다.");
    const b = JSON.parse(raw);
    if (b.action === "order") {
      const a = await advertiser();
      return Response.json(await orderProduct(a.id, b.data), { headers });
    }
    if (b.action === "apply") {
      const p = await portalParticipant();
      return Response.json(await applyCampaign(p.id, b.data), { headers });
    }
    if (b.action === "withdraw") {
      const p = await portalParticipant();
      return Response.json(await withdrawApplication(p.id, b.id, b.version), {
        headers,
      });
    }
    return Response.json(await marketAdmin(b, await requireActor()), {
      headers,
    });
  } catch (e) {
    return failure(e);
  }
}
