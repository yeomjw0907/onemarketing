import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import { portalParticipant, portalView } from "@/lib/portal";
import {
  respondOffer,
  submitPublication,
  availability,
  upgradeBundle,
} from "@/lib/work-offers";
import { transaction, lock, update, audit } from "@/lib/db";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export async function GET() {
  try {
    return Response.json(await portalView(await portalParticipant()), {
      headers,
    });
  } catch {
    return Response.json(
      { error: "유효한 접속 링크로 접속해주세요." },
      { status: 401, headers },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const b = await request.json();
    if (b.action === "login") {
      await portalParticipant(String(b.access));
      (await cookies()).set("om_participant", String(b.access), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 86400,
      });
      return Response.json({ ok: true }, { headers });
    }
    if (b.action === "logout") {
      (await cookies()).delete("om_participant");
      return Response.json({ ok: true }, { headers });
    }
    const p = await portalParticipant();
    let result: unknown;
    if (b.action === "upgrade")
      result = await upgradeBundle(
        b.blogSlotId,
        b.clipSlotId,
        p.id,
        b.clipAccountId,
      );
    else if (b.action === "batch-respond") {
      if (!Array.isArray(b.ids) || b.ids.length > 100)
        throw new Error("제안 목록을 확인하세요.");
      result = await transaction(async () => {
        const results = [];
        for (const id of [...new Set(b.ids as string[])].sort())
          results.push(await respondOffer(id, p.id, true));
        return results;
      });
    } else if (b.action === "respond")
      result = await respondOffer(b.id, p.id, b.accept === true);
    else if (b.action === "submit")
      result = await submitPublication(b.id, p.id, String(b.link));
    else if (b.action === "availability")
      result = await availability(p.id, b.items);
    else if (b.action === "marketing-consent")
      result = await transaction(async () => {
        await lock("save:participants");
        const r = await update(p.id, {
          kakaoMarketingConsent: b.consent === true,
          kakaoMarketingConsentAt: new Date().toISOString(),
        });
        await audit("participant:" + p.id, "marketing-consent", p.id, {
          consent: b.consent === true,
        });
        return { consent: r.kakaoMarketingConsent };
      });
    else throw new Error("잘못된 요청입니다.");
    return Response.json(result, { headers });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "처리 실패" },
      { status: 400, headers },
    );
  }
}
