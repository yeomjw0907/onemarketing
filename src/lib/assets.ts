import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { audit, create, list, update, transaction, lock } from "./db";
import { getObject, putObject, removeObjects } from "./storage";
import { requireRecord } from "./domain";
import type { RecordData } from "./types";
export function storageName(a: RecordData) {
  const name = String(a.storageName);
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/.test(name))
    throw new Error("잘못된 파일 경로입니다.");
  return name;
}
// 비공개 버킷에서 파일 내용을 읽는다. 관리자 인증은 호출하는 라우트가 확인한다.
export function bytes(a: RecordData) {
  return getObject(storageName(a));
}
// ffmpeg 등 로컬 경로가 필요한 처리를 위해 임시 폴더에 내려받는다. 호출자가 폴더를 정리한다.
export async function localCopy(a: RecordData, folder?: string) {
  const dir = folder || mkdtempSync(path.join(tmpdir(), "om-asset-"));
  const file = path.join(dir, storageName(a));
  writeFileSync(file, await bytes(a));
  return file;
}
export async function imageFingerprint(buffer: Buffer) {
  const values = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(8, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const average = values.reduce((s, v) => s + v, 0) / values.length;
  return Array.from(values, (v) => (v >= average ? "1" : "0")).join("");
}
export function detectMime(buffer: Buffer, extension: string) {
  if (
    extension === "png" &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (
    ["jpg", "jpeg"].includes(extension) &&
    buffer[0] === 255 &&
    buffer[1] === 216
  )
    return "image/jpeg";
  if (
    extension === "webp" &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (extension === "mp4" && buffer.toString("ascii", 4, 8) === "ftyp")
    return "video/mp4";
  if (extension === "xlsx" && buffer.toString("ascii", 0, 2) === "PK")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (["csv", "txt", "md"].includes(extension) && !buffer.includes(0))
    return "text/plain; charset=utf-8";
  throw new Error(
    "파일 확장자와 실제 내용이 맞지 않거나 지원하지 않는 형식입니다.",
  );
}
export async function extractSheet(buffer: Buffer, ext: string) {
  if (!["xlsx", "csv"].includes(ext)) return null;
  if (ext === "csv")
    return buffer.toString("utf8").replace(/^﻿/, "").slice(0, 50000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  let count = 0;
  const sheets: string[] = [];
  for (const sheet of workbook.worksheets.slice(0, 5)) {
    const rows: string[] = [];
    sheet.eachRow((row) => {
      if (++count > 300) return;
      const fields: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (fields.length >= 30) return;
        const v = cell.value;
        fields.push(
          typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
            ? String(v).slice(0, 1000)
            : "",
        );
      });
      rows.push(fields.join("\t"));
    });
    sheets.push(`[${sheet.name}]\n${rows.join("\n")}`);
  }
  return sheets.join("\n\n").slice(0, 50000);
}
export async function saveAsset(
  input: {
    projectId: string;
    taskId?: string;
    category: string;
    name: string;
    buffer: Buffer;
    text?: string;
    extracted?: string | null;
    slot?: string;
    jobId?: string;
    fingerprint?: string;
  },
  actor: string,
) {
  const project = await requireRecord(input.projectId, "projects");
  if (
    project.settled ||
    ["completed", "cancelled"].includes(String(project.status))
  )
    throw new Error("마감한 프로젝트에는 자료를 추가할 수 없습니다.");
  if (input.taskId) {
    const task = await requireRecord(input.taskId, "tasks");
    if (input.jobId) {
      const job = await requireRecord(input.jobId, "jobs");
      const snapshot = (job.snapshot as { task: RecordData }).task;
      if (
        snapshot.brief !== task.brief ||
        snapshot.briefApprovedAt !== task.briefApprovedAt ||
        !["producing", "review"].includes(String(project.status))
      )
        throw new Error(
          "제작 중 기획이 변경되었습니다. 비용을 확인하고 승인한 기획으로 다시 제작하세요.",
        );
    }
    if (task.projectId !== project.id)
      throw new Error("다른 프로젝트의 작업입니다.");
    if (["delivered", "submitted", "verified"].includes(String(task.status)))
      throw new Error(
        "이미 전달된 작업입니다. 새 프로젝트로 변경 내용을 관리하세요.",
      );
  }
  const ext = path.extname(input.name).slice(1).toLowerCase(),
    mime = detectMime(input.buffer, ext),
    hash = createHash("sha256").update(input.buffer).digest("hex");
  if (input.category === "image" && !mime.startsWith("image/"))
    throw new Error("이미지 형식이 아닙니다.");
  if (input.category === "video" && mime !== "video/mp4")
    throw new Error("MP4 영상이 아닙니다.");
  const duplicate = (await list("assets")).find(
    (a) =>
      a.projectId === project.id &&
      a.category === "image" &&
      a.hash === hash &&
      a.taskId !== input.taskId &&
      a.current === true,
  );
  if (input.category === "image" && duplicate)
    throw new Error(
      "다른 게시 작업에 사용한 이미지입니다. 중복되지 않는 이미지를 등록하세요.",
    );
  // 업로드가 성공한 뒤에만 DB에 기록한다. DB 기록이 실패하면 올린 객체를 정리한다.
  const storageName = randomUUID() + "." + ext;
  await putObject(storageName, input.buffer, mime);
  try {
    return await transaction(async () => {
      await lock("assets:" + project.id);
      const slot =
        input.slot ||
        (input.category === "copy" || input.category === "video"
          ? input.category
          : randomUUID());
      const assets = await list("assets");
      if (input.taskId && input.category !== "source") {
        for (const a of assets.filter(
          (a) =>
            a.taskId === input.taskId && a.slot === slot && a.current === true,
        ))
          await update(a.id, { current: false });
        const t = await requireRecord(input.taskId);
        await update(t.id, { status: "review", approvedAssets: [] });
        if (["ready", "publishing"].includes(String(project.status)))
          await update(project.id, { status: "review" });
      }
      const a = await create("assets", {
        projectId: input.projectId,
        customerId: project.customerId,
        taskId: input.taskId || null,
        category: input.category,
        name: path.basename(input.name),
        mime,
        hash,
        fingerprint: input.fingerprint || null,
        similarWarning:
          input.category === "image" &&
          !!input.fingerprint &&
          assets.some(
            (a) =>
              a.projectId === project.id &&
              a.taskId !== input.taskId &&
              a.category === "image" &&
              a.current === true &&
              typeof a.fingerprint === "string" &&
              a.fingerprint.length === input.fingerprint!.length &&
              Array.from(input.fingerprint!).filter(
                (v, i) => v !== (a.fingerprint as string)[i],
              ).length <= 6,
          ),
        storageName,
        size: input.buffer.length,
        current: true,
        slot,
        text: input.text || null,
        extracted: input.extracted || null,
        jobId: input.jobId || null,
      });
      await audit(actor, "asset-created", a.id, { projectId: project.id });
      return a;
    });
  } catch (e) {
    await removeObjects([storageName]).catch(() => {});
    throw e;
  }
}
