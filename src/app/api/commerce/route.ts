import { cookies } from "next/headers";
import { actor, sameOrigin } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { portalParticipant } from "@/lib/portal";
import { boundedBody } from "@/lib/mcp-http";
import { ZodError } from "zod";
import {
  cancelUnpaidOrder,
  commerceView,
  checkout,
  paymentInstructions,
  savePaymentSettings,
  confirmPayment,
  publicCommerceCampaigns,
  applyCommerce,
  campaignAction,
  participantCommerceAction,
  type CommerceActor,
} from "@/lib/commerce";
import { policyVersion } from "@/lib/commerce-policy";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function identity(role: string | null): Promise<CommerceActor> {
  if (role === "admin") {
    const id = await actor();
    if (!id) throw new Error("관리자 로그인이 필요합니다.");
    return { role: "admin", id };
  }
  if (role === "participant") {
    const p = await portalParticipant();
    return { role: "participant", id: p.id };
  }
  const a = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  if (!a) throw new Error("광고주 로그인이 필요합니다.");
  return { role: "advertiser", id: a.id };
}
function fail(e: unknown) {
  const message =
    e instanceof ZodError
      ? e.issues[0]?.message
      : e instanceof Error
        ? e.message
        : "처리하지 못했습니다.";
  return Response.json(
    { error: message },
    {
      status: /로그인|접속 링크|접속이 만료/.test(message || "") ? 401 : 400,
      headers,
    },
  );
}
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    if (p.get("mode") === "catalog") {
      await identity(null);
      return Response.json(
        { policyVersion, payment: await paymentInstructions() },
        { headers },
      );
    }
    if (p.get("mode") === "campaigns")
      return Response.json(await publicCommerceCampaigns(), { headers });
    return Response.json(await commerceView(await identity(p.get("role"))), {
      headers,
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const raw = await boundedBody(req, 100000);
    if (raw.length > 100000) throw new Error("요청 내용이 너무 큽니다.");
    const b = JSON.parse(raw);
    const who = await identity(b.role || null);
    let result;
    if (b.action === "cancel-order")
      result = await cancelUnpaidOrder(who, b.id, b.version);
    else if (b.action === "checkout") {
      if (who.role !== "advertiser")
        throw new Error("광고주 계정으로 주문하세요.");
      result = await checkout(who.id, b.data);
    } else if (b.action === "bank")
      result = await savePaymentSettings(who, b.data);
    else if (b.action === "payment")
      result = await confirmPayment(who, b.id, b.version, b.reference);
    else if (b.action === "apply") {
      if (who.role !== "participant") throw new Error("참여자로 로그인하세요.");
      result = await applyCommerce(who.id, b.data);
    } else if (b.action === "participant") {
      if (who.role !== "participant") throw new Error("참여자로 로그인하세요.");
      result = await participantCommerceAction(who.id, b.data);
    } else if (b.action === "campaign")
      result = await campaignAction(who, b.data);
    else throw new Error("알 수 없는 요청입니다.");
    return Response.json(result, { headers });
  } catch (e) {
    return fail(e);
  }
}
