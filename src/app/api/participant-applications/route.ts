import { cookies } from "next/headers";
import { pendingKakao } from "@/lib/kakao-auth";
import { requireActor, sameOrigin } from "@/lib/auth";
import {
  listApplications,
  reviewApplication,
  reviewApplicationsBulk,
  submitApplication,
} from "@/lib/participant-applications";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET() {
  try {
    await requireActor();
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  return Response.json(await listApplications(), {
    headers: { "Cache-Control": "no-store" },
  });
}
async function read(request: Request) {
  sameOrigin(request);
  const text = await request.text();
  if (text.length > 40000) throw new Error("신청 내용이 너무 깁니다.");
  return JSON.parse(text);
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
    { status: 400 },
  );
}
export async function POST(request: Request) {
  try {
    const input = await read(request);
    const identity = (await cookies()).get("om_kakao_pending")?.value;
    if (
      (input as { requireKakao?: boolean }).requireKakao === true &&
      !identity
    )
      throw new Error(
        "카카오 로그인 시간이 만료되었어요. 카카오로 다시 로그인한 뒤 신청해주세요.",
      );
    let kakaoId: string | undefined;
    if (identity) kakaoId = String((await pendingKakao(identity)).kakaoId);
    return Response.json(
      { ...(await submitApplication(input, kakaoId)), kakaoLinked: !!kakaoId },
      {
        status: 201,
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  let actor: string;
  try {
    actor = await requireActor();
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const body = await read(request);
    return Response.json(
      await (body.action === "bulk-approve" ||
      body.action === "bulk-reject" ||
      body.action === "bulk-reapprove" ||
      body.action === "bulk-delete" ||
      body.action === "bulk-restore"
        ? reviewApplicationsBulk(body, actor)
        : reviewApplication(body, actor)),
    );
  } catch (e) {
    return failure(e);
  }
}
