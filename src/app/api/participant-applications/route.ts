import { requireActor, sameOrigin } from "@/lib/auth";
import {
  listApplications,
  reviewApplication,
  submitApplication,
} from "@/lib/participant-applications";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
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
    return Response.json(await submitApplication(await read(request)), {
      status: 201,
    });
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
    return Response.json(await reviewApplication(await read(request), actor));
  } catch (e) {
    return failure(e);
  }
}
