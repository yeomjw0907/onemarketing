import { cookies } from "next/headers";
import { actor, sameOrigin } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { portalParticipant } from "@/lib/portal";
import { boundedBody } from "@/lib/mcp-http";
import {
  databaseUnavailable,
  databaseUnavailableResponse,
} from "@/lib/database-errors";
import {
  accountRequests,
  requestAccountHelp,
  changeAccountRequest,
  type AccountOwner,
} from "@/lib/account-requests";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
class Unauthorized extends Error {}
async function identity(
  role: unknown,
): Promise<AccountOwner | { role: "admin"; id: string }> {
  if (role === "admin") {
    const id = await actor();
    if (!id) throw new Unauthorized("관리자 로그인이 필요합니다.");
    return { role, id };
  }
  if (role === "advertiser") {
    const a = await advertiserSession(
      (await cookies()).get("om_advertiser")?.value,
    );
    if (!a) throw new Unauthorized("광고주 로그인이 필요합니다.");
    return { role, id: a.id };
  }
  if (role === "participant") {
    try {
      return { role, id: (await portalParticipant()).id };
    } catch (e) {
      if (databaseUnavailable(e)) throw e;
      throw new Unauthorized("참여자 로그인이 필요합니다.");
    }
  }
  throw new Error("계정 유형을 선택해주세요.");
}
function fail(e: unknown) {
  if (databaseUnavailable(e)) return databaseUnavailableResponse();
  return Response.json(
    {
      error:
        e instanceof ZodError
          ? e.issues[0]?.message
          : e instanceof Error
            ? e.message
            : "처리하지 못했어요.",
    },
    { status: e instanceof Unauthorized ? 401 : 400, headers },
  );
}
export async function GET(request: Request) {
  try {
    const who = await identity(new URL(request.url).searchParams.get("role"));
    return Response.json(
      {
        requests: await accountRequests(who.role === "admin" ? undefined : who),
      },
      { headers },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const b = JSON.parse(await boundedBody(request, 16000));
    const who = await identity(b.role);
    if (b.action === "request" && who.role !== "admin")
      return Response.json(await requestAccountHelp(who, b.data), { headers });
    if (b.action === "update")
      return Response.json(
        { request: await changeAccountRequest(who, b.data) },
        { headers },
      );
    throw new Error("요청 작업을 확인해주세요.");
  } catch (e) {
    return fail(e);
  }
}
