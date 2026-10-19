import { z } from "zod";
import type { RecordData, DatabaseView } from "./types";
export const scenarioSchema = z.object({
  candidates: z
    .array(
      z.object({
        title: z.string().min(1).max(150),
        concept: z.string().min(1).max(1500),
        target: z.string().max(1000),
        rationale: z.string().max(2000),
        scenes: z
          .array(
            z.object({
              seconds: z.number().int().min(1).max(30),
              visual: z.string().min(1).max(1500),
              caption: z.string().max(100),
              method: z.enum(["source", "generated", "footage"]),
              requirements: z.string().max(1000),
            }),
          )
          .min(1)
          .max(8),
        cta: z.string().min(1).max(100),
        risks: z.array(z.string().max(1000)).max(10),
      }),
    )
    .length(3),
});
export type Scenario = z.infer<typeof scenarioSchema>["candidates"][number];
export function creativeBasis(p: RecordData, t: RecordData) {
  return JSON.stringify(
    {
      knowledge: p.knowledge,
      product: p.productUnderstanding,
      instructions: p.instructions,
      mediaInstructions: p.mediaInstructions,
      brief: t.brief,
      duration: t.duration,
      format: t.creativeFormat || "standard",
    },
    (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, value[k]]),
          )
        : value,
  );
}
export function taskFlow(data: DatabaseView, task: RecordData) {
  const jobs = data.jobs.filter((j) => j.taskId === task.id);
  const assets = data.assets.filter(
    (a) => a.taskId === task.id && a.current === true,
  );
  const plans = data.media_plans.filter((p) => p.taskId === task.id);
  const state = (types: string[], done: boolean, waiting = false) => {
    const job = jobs.find((j) => types.includes(String(j.type)));
    if (
      job &&
      ["pending", "running", "uncertain", "failed"].includes(String(job.status))
    )
      return String(job.status);
    return done ? "succeeded" : waiting ? "review" : "planned";
  };
  const copy = assets.find((a) => a.category === "copy");
  return [
    {
      id: "plan",
      title: "PM · 제작 방향",
      state:
        task.creativeFormat === "story"
          ? state(
              ["scenario"],
              !!task.approvedCreativePlanId,
              plans.some(
                (p) => p.mediaType === "scenario" && p.status === "draft",
              ),
            )
          : "succeeded",
    },
    {
      id: "copy",
      title: "원고 · 교정·검증",
      state:
        copy && (copy.copyQuality as { status?: string })?.status === "blocked"
          ? "changes"
          : state(["copy"], !!copy),
    },
    {
      id: "brief",
      title: "장면 · 제작 승인",
      state: state(
        ["media-plan"],
        plans.some(
          (p) =>
            ["approved", "used"].includes(String(p.status)) &&
            p.mediaType !== "scenario",
        ),
        plans.some((p) => p.status === "draft" && p.mediaType !== "scenario"),
      ),
    },
    {
      id: "image",
      title: "이미지 · 자료",
      state: state(
        ["image"],
        assets.some((a) => a.category === "image"),
      ),
    },
    ...(task.channel === "clip"
      ? [
          {
            id: "video",
            title: "영상 · 편집",
            state: state(
              ["video", "slideshow"],
              assets.some((a) => a.category === "video"),
            ),
          },
        ]
      : []),
    {
      id: "review",
      title: "운영자 · 최종 검수",
      state: ["approved", "delivered", "submitted", "verified"].includes(
        String(task.status),
      )
        ? "succeeded"
        : String(task.status) === "changes"
          ? "changes"
          : String(task.status) === "review"
            ? "review"
            : "planned",
    },
  ];
}
