import { briefingPrompt, mediaGuidance } from "./media-guidance";
import { createHash } from "node:crypto";
import { z } from "zod";
import { audit, list, lock, transaction, update } from "./db";
import { requireRecord } from "./domain";
import { orderedImages } from "./copy-format";
import type { RecordData } from "./types";

export const mediaBriefSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  scenes: z
    .array(
      z.object({
        timing: z.string().max(100),
        composition: z.string().min(1).max(1500),
        people: z.boolean(),
        hands: z.boolean(),
        eating: z.boolean(),
        action: z.string().max(1500),
        camera: z.string().max(1500),
      }),
    )
    .min(1)
    .max(8),
  warnings: z.array(z.string().max(1000)).max(10),
  prompt: z.string().trim().min(1).max(16000),
  edit: z
    .object({
      title: z.string().trim().max(36).optional(),
      titleLead: z.string().trim().max(24).optional(),
      titleAccent: z.string().trim().max(24).optional(),
      layout: z.enum(["auto", "split", "overlay"]).optional(),
      contentKind: z.enum(["service", "product", "story"]).optional(),
      accentColor: z.enum(["yellow", "red", "mint"]).optional(),
      titleStyle: z
        .enum(["auto", "clean", "impact", "editorial", "pop"])
        .optional(),
      titleMotion: z.enum(["auto", "none", "fade", "slide"]).optional(),
      hook: z.string().trim().max(60),
      detail: z.string().trim().max(100),
      cta: z.string().trim().max(60),
    })
    .optional(),
});
export type MediaBrief = z.infer<typeof mediaBriefSchema>;
export async function mediaBinding(
  projectId: string,
  taskId: string,
  type: "image" | "video",
  replaceAssetId?: string,
  sourceAssetId?: string,
) {
  const project = await requireRecord(projectId, "projects");
  const task = await requireRecord(taskId, "tasks");
  if (
    type === "video" &&
    task.creativeFormat === "story" &&
    (
      task.approvedCreativeCandidate as
        { scenes?: { method: string }[] } | undefined
    )?.scenes?.some((s) => s.method === "footage")
  )
    throw new Error(
      "실제 촬영이 필요한 시나리오입니다. 실제 자료로 편집한 영상을 등록하거나 촬영이 필요 없는 방향으로 시나리오를 다시 승인하세요.",
    );
  if (task.projectId !== projectId) throw new Error("프로젝트가 다릅니다.");
  const assets = (await list("assets")).filter(
    (a) =>
      a.projectId === projectId &&
      (a.category === "source" ||
        (a.taskId === taskId &&
          ["image", "copy"].includes(String(a.category)))),
  );
  const images = orderedImages(assets, taskId);
  if (
    replaceAssetId &&
    (type !== "image" ||
      !images.some((a) => a.id === replaceAssetId && a.common !== true))
  )
    throw new Error("교체할 이미지를 확인하세요.");
  const source =
    (sourceAssetId
      ? assets.find(
          (a) =>
            a.id === sourceAssetId &&
            a.current !== false &&
            String(a.mime).startsWith("image/") &&
            (a.category === "source" || a.taskId === taskId),
        )
      : undefined) ||
    (!sourceAssetId
      ? (type === "video"
          ? images.find(
              (a) =>
                Array.isArray(task.approvedAssets) &&
                task.approvedAssets.includes(a.id),
            )
          : undefined) ||
        assets.find(
          (a) =>
            a.category === "source" &&
            a.current !== false &&
            String(a.mime).startsWith("image/"),
        )
      : undefined);
  if (!source) throw new Error("기준 사진을 먼저 등록하세요.");
  const duration =
    task.mode === "hybrid"
      ? Math.min(6, Math.max(4, Math.floor(Number(task.duration) / 3)))
      : Number(task.duration || 10);
  if (
    type === "video" &&
    (!Number.isInteger(duration) || duration < 4 || duration > 30)
  )
    throw new Error("영상 방식·길이를 확인하세요.");
  const settings =
    type === "image"
      ? {
          image_size: { width: 1024, height: 1536 },
          quality: "medium",
          num_images: 1,
          output_format: "png",
        }
      : {
          duration: String(duration),
          resolution: "720p",
          aspect_ratio: "auto",
          generate_audio: false,
          end_user_id: String(project.customerId || project.id),
        };
  const model =
    type === "image"
      ? process.env.FAL_IMAGE_MODEL || "openai/gpt-image-2.5/sunburst/edit"
      : process.env.FAL_VIDEO_MODEL || "bytedance/seedance-2.5/image-to-video";
  const sceneNumber = replaceAssetId
    ? images.findIndex((a) => a.id === replaceAssetId) + 1
    : images.length + 1;
  const guidance = mediaGuidance(project, type === "video");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        project,
        task: {
          id: task.id,
          name: task.name,
          channel: task.channel,
          brief: task.brief,
          briefApprovedAt: task.briefApprovedAt,
          feedback: task.feedback,
          images: task.images,
          duration: task.duration,
          mode: task.mode,
          approvedAssets: task.approvedAssets,
          creativeFormat: task.creativeFormat || "standard",
          approvedCreativePlanId: task.approvedCreativePlanId || null,
          approvedCreativeCandidate: task.approvedCreativeCandidate || null,
        },
        assets: assets.map((a) => [a.id, a.version, a.sha256, a.current]),
        type,
        replaceAssetId: replaceAssetId || null,
        model,
        settings,
        guidance,
        sourceAssetId: source.id,
      }),
    )
    .digest("hex");
  return {
    fingerprint,
    sourceAssetId: source.id,
    model,
    settings,
    sceneNumber,
    guidance,
  };
}
export async function validateMediaPlan(
  plan: RecordData,
  projectId: string,
  taskId: string,
  type: "image" | "video",
  replaceAssetId?: string,
) {
  if (
    plan.projectId !== projectId ||
    plan.taskId !== taskId ||
    plan.mediaType !== type ||
    (plan.replaceAssetId || null) !== (replaceAssetId || null)
  )
    throw new Error("브리핑의 작업·생성 종류가 다릅니다.");
  const binding = await mediaBinding(
    projectId,
    taskId,
    type,
    replaceAssetId,
    String(plan.sourceAssetId),
  );
  if (binding.fingerprint !== plan.fingerprint)
    throw new Error(
      "자료·기획·설정이 변경되었습니다. 새 브리핑을 작성하고 검수하세요.",
    );
  const brief = mediaBriefSchema.parse(plan.brief);
  if (type === "image" && brief.scenes.length !== 1)
    throw new Error("이미지는 한 장면으로 브리핑하세요.");
  const task = await requireRecord(taskId, "tasks");
  if (
    type === "video" &&
    task.creativeFormat !== "story" &&
    brief.scenes.length !== 1
  )
    throw new Error(
      "기존형 영상 생성은 연속된 한 장면으로 작성하세요. 자막·CTA는 편집 단계에서 넣습니다.",
    );
  return binding;
}
export function editMediaPlan(input: unknown, actor: string) {
  const body = z
    .object({
      id: z.string(),
      version: z.number().int().positive(),
      action: z.enum(["edit", "approve"]),
      brief: mediaBriefSchema.optional(),
    })
    .parse(input);
  return transaction(async () => {
    let plan = await requireRecord(body.id, "media_plans");
    await lock("project-operations:" + plan.projectId);
    await lock("jobs:" + plan.projectId);
    await lock("assets:" + plan.projectId);
    plan = await requireRecord(body.id, "media_plans");
    const p = await requireRecord(String(plan.projectId), "projects");
    if (
      p.settled ||
      p.hold ||
      !["producing", "review"].includes(String(p.status))
    )
      throw new Error("현재 단계에서는 브리핑을 승인·수정할 수 없습니다.");
    if (plan.consumedJobId)
      throw new Error(
        "이미 생성에 사용한 브리핑입니다. 새 브리핑을 작성하세요.",
      );
    if (body.action === "approve")
      await validateMediaPlan(
        plan,
        p.id,
        String(plan.taskId),
        plan.mediaType as "image" | "video",
        plan.replaceAssetId ? String(plan.replaceAssetId) : undefined,
      );
    const patch =
      body.action === "edit"
        ? {
            brief: mediaBriefSchema.parse(body.brief),
            status: "draft",
            approvedAt: null,
            approvedBy: null,
            approvedPrompt: null,
          }
        : {
            status: "approved",
            approvedAt: new Date().toISOString(),
            approvedBy: actor,
            approvedPrompt: briefingPrompt(
              mediaBriefSchema.parse(plan.brief),
              String(plan.guidance || ""),
            ),
          };
    const result = await update(plan.id, patch, body.version);
    await audit(actor, "media-plan-" + body.action, plan.id, {
      projectId: p.id,
    });
    return result;
  });
}
