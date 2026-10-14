import { z } from "zod";
import { audit, create, list, transaction, update } from "./db";
import { requireRecord } from "./domain";
import { bytes } from "./assets";
import type { RecordData } from "./types";
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
    const folder =
      String(task.order).padStart(2, "0") +
      "_" +
      String(task.name)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 80);
    let i = 0;
    for (const asset of assets) {
      const filename =
        String(++i).padStart(2, "0") +
        "_" +
        String(asset.name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
      entries.push({
        path: folder + "/" + filename,
        buffer: await bytes(asset),
      });
      if (asset.category === "copy")
        entries.push({
          path: folder + "/원고.txt",
          buffer: Buffer.from(String(asset.text), "utf8"),
        });
    }
    entries.push({
      path: folder + "/게시안내.txt",
      buffer: Buffer.from(
        `작업: ${task.name}\n채널: ${task.channel === "blog" ? "네이버 블로그" : "네이버 클립"}\n승인일: ${task.approvedAt}\n원고의 이미지 삽입 순서를 확인해 주세요.\n게시 후 링크를 운영자에게 전달해 주세요.\n`,
      ),
    });
    manifest.push({
      taskId: task.id,
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
export function recordDelivery(input: unknown, actor: string) {
  const body = z
    .object({
      projectId: z.string(),
      taskIds: z.array(z.string()).min(1),
      channel: z.string().trim().min(1).max(100),
      note: z.string().max(2000).default(""),
    })
    .parse(input);
  return transaction(async () => {
    const bundle = await approvedBundle(body.projectId, body.taskIds);
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
        status: "delivered",
        deliveryVersion: task.approvedAssets,
        deliveredAt: row.createdAt,
      });
    const p = bundle.project;
    if (p.status === "ready") await update(p.id, { status: "publishing" });
    await audit(actor, "delivery-recorded", p.id, { deliveryId: row.id });
    return row;
  });
}
