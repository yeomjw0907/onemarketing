import { z } from "zod";
import { audit, create, list, lock, transaction, update } from "./db";
import { requireRecord } from "./domain";
import { bytes } from "./assets";
import type { RecordData } from "./types";
import { publishableCopy, orderedImages } from "./copy-format";
export async function approvedBundle(projectId: string, taskIds?: string[]) {
  const p = await requireRecord(projectId, "projects");
  const tasks = (await list("tasks")).filter(
    (t) =>
      t.projectId === p.id &&
      (taskIds
        ? taskIds.includes(t.id)
        : ["approved", "delivered", "submitted", "verified"].includes(
            String(t.status),
          )),
  );
  if (!tasks.length) throw new Error("전달할 승인본이 없습니다.");
  if (taskIds && tasks.length !== new Set(taskIds).size)
    throw new Error("작업 목록을 확인하세요.");
  const entries: { path: string; buffer: Buffer }[] = [];
  const manifest: Record<string, unknown>[] = [];
  const allAssets = await list("assets");
  for (const task of tasks) {
    if (
      !["approved", "delivered", "submitted", "verified"].includes(
        String(task.status),
      )
    )
      throw new Error("미승인 작업이 포함되어 있습니다.");
    const ids = task.approvedAssets as string[];
    if (!ids?.length) throw new Error("승인 버전이 없습니다.");
    const assets: RecordData[] = [];
    for (const id of ids) assets.push(await requireRecord(id, "assets"));
    if (
      assets.some(
        (a) =>
          a.taskId !== task.id || a.projectId !== p.id || a.current !== true,
      )
    )
      throw new Error("승인 후 파일이 변경되었습니다. 다시 검수하세요.");
    const snapshot = task.participantSnapshot as {
      name?: string;
      operationType?: string;
      account?: { label?: string; url?: string };
    } | null;
    const folder =
      String(task.order).padStart(2, "0") +
      "_" +
      String(
        task.name +
          (snapshot?.operationType === "managed"
            ? "_" +
              (snapshot.account?.label || task.participantAccountId || "계정")
            : ""),
      )
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 80);
    let i = 0;
    for (const asset of assets) {
      if (asset.category === "copy") {
        entries.push({
          path: folder + "/원고.txt",
          buffer: Buffer.from(
            publishableCopy(String(asset.text || "")),
            "utf8",
          ),
        });
        continue;
      }
      const filename =
        String(++i).padStart(2, "0") +
        "_" +
        String(asset.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
      entries.push({
        path:
          folder +
          "/" +
          (asset.category === "image"
            ? `이미지_${String(orderedImages(allAssets, task.id).findIndex((a) => a.id === asset.id) + 1).padStart(2, "0")}_` +
              String(asset.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
            : filename),
        buffer: await bytes(asset),
      });
    }
    entries.push({
      path: folder + "/게시안내.txt",
      buffer: Buffer.from(
        `담당자: ${snapshot?.name || "미배정"}\n게시 계정: ${snapshot?.account?.label || ""} ${snapshot?.account?.url || ""}\n작업: ${task.name}\n채널: ${task.channel === "blog" ? "네이버 블로그" : "네이버 클립"}\n승인일: ${task.approvedAt}\n원고의 이미지 삽입 순서를 확인해 주세요.\n게시 후 링크를 운영자에게 전달해 주세요.\n`,
      ),
    });
    manifest.push({
      taskId: task.id,
      participantId: task.participantId,
      participantAccountId: task.participantAccountId,
      account: snapshot?.account || null,
      name: task.name,
      approvedAt: task.approvedAt,
      files: assets.map((a) => ({ id: a.id, name: a.name, hash: a.hash })),
    });
  }
  entries.push({
    path: "manifest.json",
    buffer: Buffer.from(
      JSON.stringify(
        {
          project: String(p.name),
          generatedAt: new Date().toISOString(),
          tasks: manifest,
        },
        null,
        2,
      ),
    ),
  });
  return { project: p, tasks, entries };
}
export async function participantBundle(projectId: string, setId: string) {
  const set = await requireRecord(setId, "posting_sets");
  if (set.status === "cancelled") throw new Error("해제한 게시 세트입니다.");
  if (set.projectId !== projectId)
    throw new Error("다른 프로젝트의 게시 세트입니다.");
  const bundle = await approvedBundle(projectId, [
    String(set.blogTaskId),
    String(set.clipTaskId),
  ]);
  if (
    bundle.tasks.some(
      (t) => t.postingSetId !== set.id || t.participantId !== set.participantId,
    )
  )
    throw new Error("참여자 배정을 확인하세요.");
  const name = String(set.participantName)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .slice(0, 80);
  bundle.entries.push({
    path: "세트_게시안내.txt",
    buffer: Buffer.from(
      `참여자: ${set.participantName}\n프로젝트: ${bundle.project.name}\n게시 마감: ${bundle.project.due || "운영자와 협의"}\n구성: 블로그 1건 + 클립 1건\n약정 보수: ${set.amount}원 (두 게시물 확인 후 세트당 1회 지급)\n${String(set.instructions || "")}\n원고의 광고·협찬 표시와 필수 문구를 유지해 주세요.\n게시 후 블로그와 클립 링크를 각각 운영자에게 전달해 주세요.\n`,
      "utf8",
    ),
  });
  return { ...bundle, filename: `${bundle.project.name}_${name}_게시세트.zip` };
}
export async function workSlotBundle(projectId: string, slotId: string) {
  const slot = await requireRecord(slotId, "work_slots");
  if (slot.projectId !== projectId || !slot.participantId)
    throw new Error("배정된 동일 프로젝트의 슬롯을 선택하세요.");
  const bundle = await approvedBundle(projectId, slot.taskIds as string[]);
  if (
    bundle.tasks.some(
      (t) => t.workSlotId !== slot.id || t.participantId !== slot.participantId,
    )
  )
    throw new Error("슬롯 배정을 확인하세요.");
  bundle.entries.push({
    path: "체험단_게시안내.txt",
    buffer: Buffer.from(
      `담당자: ${slot.participantName}\n프로젝트: ${bundle.project.name}\n구성: ${slot.name}\n약정 보수: ${slot.amount}원 (슬롯의 게시물 모두 확인 후 1회 지급)\n게시 마감: ${bundle.project.due || "운영자와 협의"}\n원고의 광고·협찬 표시는 유지하고 게시 후 링크를 운영자에게 전달해 주세요.\n`,
    ),
  });
  const name = String(slot.participantName)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .slice(0, 80);
  return {
    ...bundle,
    filename: `${bundle.project.name}_${name}_${slot.type}.zip`,
  };
}
export function recordDelivery(input: unknown, actor: string) {
  const body = z
    .object({
      projectId: z.string(),
      taskIds: z.array(z.string()).min(1),
      channel: z.string().trim().min(1).max(100),
      note: z.string().max(2000).default(""),
      postingDeadlineAt: z.string().datetime({ offset: true }).optional(),
    })
    .parse(input);
  return transaction(async () => {
    await lock("project-operations:" + body.projectId);
    await lock("assets:" + body.projectId);
    const bundle = await approvedBundle(body.projectId, body.taskIds);
    if (bundle.project.settled || bundle.project.status === "cancelled")
      throw new Error("마감·취소한 프로젝트에는 전달을 기록할 수 없습니다.");
    for (const task of bundle.tasks)
      if (task.workSlotId) {
        const slot = await requireRecord(String(task.workSlotId), "work_slots");
        if (
          !slot.participantId ||
          task.participantId !== slot.participantId ||
          !(slot.taskIds as string[]).every((id) => body.taskIds.includes(id))
        )
          throw new Error(
            "슬롯의 담당자를 배정하고 슬롯 전체 파일을 함께 전달하세요.",
          );
      }
    const row = await create("deliveries", {
      ...body,
      actor,
      versions: bundle.tasks.map((t) => ({
        taskId: t.id,
        assetIds: t.approvedAssets,
      })),
      deliveredAt: new Date().toISOString(),
    });
    for (const task of bundle.tasks)
      await update(task.id, {
        status: ["submitted", "verified"].includes(String(task.status))
          ? task.status
          : "delivered",
        deliveryVersion: task.approvedAssets,
        deliveredAt: row.createdAt,
      });
    for (const task of bundle.tasks)
      if (task.participantId) {
        const deadline =
          body.postingDeadlineAt ||
          (typeof task.postingDeadlineAt === "string"
            ? task.postingDeadlineAt
            : null) ||
          (/^\d{4}-\d{2}-\d{2}$/.test(String(bundle.project.due))
            ? new Date(
                String(bundle.project.due) + "T23:59:59+09:00",
              ).toISOString()
            : null);
        await update(task.id, {
          requestedAt: task.requestedAt || row.createdAt,
          postingDeadlineAt: deadline,
        });
        await create("participant_events", {
          participantId: task.participantId,
          projectId: body.projectId,
          taskId: task.id,
          type: "request",
          occurredAt: row.createdAt,
          actor,
          deliveryId: row.id,
          note: body.note || "파일 전달·게시 요청",
          postingDeadlineAt: deadline,
        });
      }
    const p = bundle.project;
    if (p.status === "ready") await update(p.id, { status: "publishing" });
    await audit(actor, "delivery-recorded", p.id, { deliveryId: row.id });
    return row;
  });
}
