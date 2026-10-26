import { cookies } from "next/headers";
import { actor, sameOrigin } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { portalParticipant } from "@/lib/portal";
import { boundedBody } from "@/lib/mcp-http";
import {
  readAccountState,
  saveBuilder,
  changeFavorites,
  checkoutBuilder,
  StateConflict,
} from "@/lib/account-state";
import type { CommerceActor } from "@/lib/commerce";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
async function identity(section: string): Promise<CommerceActor | null> {
  if (section !== "builder") {
    const admin = await actor();
    if (admin) return { role: "admin", id: admin };
    const p = await portalParticipant().catch(() => null);
    if (p) return { role: "participant", id: p.id };
  }
  const a = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  return a ? { role: "advertiser", id: a.id } : null;
}
export async function GET(req: Request) {
  try {
    const section = new URL(req.url).searchParams.get("section");
    if (section !== "builder" && section !== "favorites")
      return Response.json(
        { error: "잘못된 저장 항목이에요." },
        { status: 400, headers },
      );
    const who = await identity(section);
    if (!who)
      return Response.json(
        { error: "로그인이 필요합니다." },
        { status: 401, headers },
      );
    return Response.json(await readAccountState(who, section), { headers });
  } catch {
    return Response.json(
      { error: "계정 저장 내용을 불러오지 못했어요." },
      { status: 503, headers },
    );
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const b = JSON.parse(await boundedBody(req, 400000));
    const section = ["save-builder", "checkout"].includes(b.action)
      ? "builder"
      : "favorites";
    const who = await identity(section);
    if (!who)
      return Response.json(
        { error: "로그인이 필요합니다." },
        { status: 401, headers },
      );
    if (
      (section === "builder" || section === "favorites") &&
      b.owner !== who.role + ":" + who.id
    )
      return Response.json(
        {
          error: "로그인 계정이 변경됐어요. 계정 내용을 다시 불러와주세요.",
          code: "account_changed",
        },
        { status: 401, headers },
      );
    const { action, owner: expectedOwner, ...data } = b;
    const result =
      action === "save-builder"
        ? await saveBuilder(who, data)
        : action === "checkout"
          ? await checkoutBuilder(who, data)
          : await changeFavorites(who, { action, ...data });
    return Response.json(result, { headers });
  } catch (e) {
    if (e instanceof StateConflict)
      return Response.json(
        { error: e.message, current: e.current },
        { status: 409, headers },
      );
    return Response.json(
      {
        error:
          e instanceof ZodError
            ? e.issues[0]?.message
            : e instanceof Error
              ? e.message
              : "계정에 저장하지 못했어요.",
      },
      { status: 400, headers },
    );
  }
}
