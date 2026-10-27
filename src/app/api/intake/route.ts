import { cookies } from "next/headers";
import { z } from "zod";
import { sameOrigin, requireActor } from "@/lib/auth";
import {
  intakeView,
  saveIntake,
  issueIntake,
  adminIntakes,
  reviewIntake,
  uploadIntake,
  prepareIntakeUpload,
  completeIntakeUpload,
  cancelIntakeUpload,
} from "@/lib/intake";
import {
  workflowBody,
  workflowBuffer,
  workflowFailure,
  privateHeaders,
  WorkflowError,
} from "@/lib/workflow-http";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
async function token() {
  return (await cookies()).get("om_intake")?.value || "";
}
export async function GET(request: Request) {
  try {
    const project = new URL(request.url).searchParams.get("project");
    if (project) {
      await requireActor();
      return Response.json(await adminIntakes(z.uuid().parse(project)), {
        headers: privateHeaders,
      });
    }
    return Response.json(await intakeView(await token()), {
      headers: privateHeaders,
    });
  } catch (e) {
    return workflowFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      // Small files pass through this bounded route. Larger videos use external reference links until signed uploads are enabled.
      if (
        Number(request.headers.get("content-length") || 0) >
        4.5 * 1024 * 1024
      )
        throw new WorkflowError(
          "이 경로에서는 4MB 이하 파일을 등록해주세요. 큰 영상은 공유 링크로 전달해주세요.",
          413,
        );
      const buffer = await workflowBuffer(request, 4.5 * 1024 * 1024);
      const form = await new Response(new Uint8Array(buffer), {
          headers: { "Content-Type": request.headers.get("content-type")! },
        }).formData(),
        file = form.get("file");
      if (!(file instanceof File) || file.size > 4 * 1024 * 1024)
        throw new WorkflowError("4MB 이하 파일을 선택해주세요.", 413);
      return Response.json(
        await uploadIntake(
          await token(),
          z.coerce.number().int().positive().parse(form.get("version")),
          file.name,
          Buffer.from(await file.arrayBuffer()),
          z.uuid().parse(form.get("intakeId")),
        ),
        { headers: privateHeaders },
      );
    }
    const b = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("open"),
          token: z.string().regex(/^[a-f0-9]{64}$/),
        }),
        z.object({
          action: z.literal("prepare-upload"),
          intakeId: z.uuid(),
          name: z.string().min(1).max(200),
          size: z.number().int().positive(),
        }),
        z.object({
          action: z.literal("complete-upload"),
          intakeId: z.uuid(),
          id: z.uuid(),
        }),
        z.object({
          action: z.literal("cancel-upload"),
          intakeId: z.uuid(),
          id: z.uuid(),
        }),
        z.object({
          action: z.literal("issue"),
          projectId: z.uuid(),
          requested: z.array(z.string()),
          note: z.string().max(2000).default(""),
        }),
        z.object({
          action: z.enum(["save", "submit"]),
          intakeId: z.uuid(),
          version: z.number().int().positive(),
          fields: z.unknown(),
        }),
        z.object({
          action: z.enum(["accept", "changes", "revoke"]),
          id: z.uuid(),
          version: z.number().int().positive(),
          note: z.string().max(2000).default(""),
        }),
      ])
      .parse(await workflowBody(request));
    if (b.action === "open") {
      const view = await intakeView(b.token);
      (await cookies()).set("om_intake", b.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/intake",
        maxAge: 30 * 86400,
      });
      return Response.json(view, { headers: privateHeaders });
    }
    if (b.action === "prepare-upload")
      return Response.json(
        await prepareIntakeUpload(await token(), b.name, b.size, b.intakeId),
        { headers: privateHeaders },
      );
    if (b.action === "complete-upload")
      return Response.json(
        await completeIntakeUpload(await token(), b.id, b.intakeId),
        {
          headers: privateHeaders,
        },
      );
    if (b.action === "cancel-upload")
      return Response.json(
        await cancelIntakeUpload(await token(), b.id, b.intakeId),
        {
          headers: privateHeaders,
        },
      );
    const result =
      b.action === "issue"
        ? await issueIntake(
            b.projectId,
            b.requested,
            b.note,
            await requireActor(),
          )
        : "fields" in b
          ? await saveIntake(
              await token(),
              b.version,
              b.fields,
              b.action === "submit",
              b.intakeId,
            )
          : await reviewIntake(
              b.id,
              b.version,
              b.action,
              b.note,
              await requireActor(),
            );
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return workflowFailure(e);
  }
}
