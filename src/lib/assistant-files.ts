import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { query, execute, transaction, lock } from "./db";
import { detectMime, extractSheet } from "./assets";
import { putObject, getObject, removeObjects } from "./storage";
import { isMcpAdmin, mcpRateLimit } from "./mcp-oauth";

export type AssistantAttachment = {
  id: string;
  owner: string;
  thread_id: string;
  name: string;
  mime: string;
  storage_name: string;
  size: number;
  extracted: string | null;
  note: string | null;
  links: Record<string, string>;
  created_at: number;
};
async function ownedThread(owner: string, id: string) {
  if (!isMcpAdmin(owner)) throw new Error("관리자 권한을 확인해주세요.");
  z.string().uuid().parse(id);
  if (
    !(
      await query("select id from assistant_threads where id=$1 and owner=$2", [
        id,
        owner,
      ])
    ).length
  )
    throw new Error("대화를 찾을 수 없어요.");
}
export async function ownedAssistantFiles(
  owner: string,
  threadId: string,
  ids: string[],
) {
  await ownedThread(owner, threadId);
  if (!ids.length) return [];
  z.array(z.string().uuid()).max(20).parse(ids);
  const rows = await query<AssistantAttachment>(
    "select * from assistant_attachments where owner=$1 and thread_id=$2 and id=any($3::uuid[])",
    [owner, threadId, ids],
  );
  if (rows.length !== new Set(ids).size)
    throw new Error("이 대화에 첨부한 파일을 선택해주세요.");
  return ids.map((id) => rows.find((r) => r.id === id)!);
}
export const publicAssistantFile = (r: AssistantAttachment) => ({
  id: r.id,
  name: r.name,
  mime: r.mime,
  size: r.size,
  note: r.note,
  url: "/api/assistant/attachments/" + r.id,
});
export async function uploadAssistantFile(
  owner: string,
  threadId: string,
  name: string,
  buffer: Buffer,
) {
  await ownedThread(owner, threadId);
  await mcpRateLimit("assistant-upload:" + owner, 40, 3600000);
  if (!buffer.length || buffer.length > 4 * 1024 * 1024)
    throw new Error("파일은 4MB 이하로 첨부해주세요.");
  name = path
    .basename(name.replaceAll("\\", "/"))
    .replace(/[\r\n\x00-\x1f]/g, "")
    .slice(0, 180);
  const ext = path.extname(name).slice(1).toLowerCase();
  if (
    !["pdf", "xlsx", "csv", "txt", "md", "png", "jpg", "jpeg", "webp"].includes(
      ext,
    )
  )
    throw new Error("PDF·엑셀·CSV·텍스트·이미지를 첨부할 수 있어요.");
  const mime = detectMime(buffer, ext);
  let extracted = await extractSheet(buffer, ext),
    note: string | null = null;
  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
    });
    try {
      const info = await parser.getInfo();
      const result = await parser.getText({ first: 30 });
      extracted = result.text.slice(0, 50000);
      if (info.total > 30)
        note = "앞 30쪽만 읽었어요. 나머지 자료는 나누어 첨부해주세요.";
      if (!result.pages.some((p) => p.text.trim().length > 20))
        note =
          "텍스트를 읽기 어려운 PDF예요. 원본은 보관하며 프로젝트 등록 후 제품 정보 정리에서 확인할 수 있어요.";
    } catch {
      throw new Error(
        "PDF를 읽지 못했어요. 암호를 해제하거나 PDF로 다시 저장해주세요.",
      );
    } finally {
      await parser.destroy();
    }
  }
  if (mime.startsWith("image/"))
    await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  const id = randomUUID(),
    storageName = id + "." + ext;
  await putObject(storageName, buffer, mime);
  try {
    return await transaction(async () => {
      await lock("assistant-files:" + threadId);
      await ownedThread(owner, threadId);
      const [count] = await query<{ n: number }>(
        "select count(*)::int as n from assistant_attachments where owner=$1 and thread_id=$2",
        [owner, threadId],
      );
      if (count.n >= 20)
        throw new Error("한 대화에는 파일을 최대 20개까지 첨부할 수 있어요.");
      await execute(
        "insert into assistant_attachments(id,owner,thread_id,name,mime,storage_name,size,extracted,note,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          id,
          owner,
          threadId,
          name,
          mime,
          storageName,
          buffer.length,
          extracted,
          note,
          Date.now(),
        ],
      );
      return publicAssistantFile(
        (await ownedAssistantFiles(owner, threadId, [id]))[0],
      );
    });
  } catch (e) {
    await removeObjects([storageName]).catch(() => {});
    throw e;
  }
}
export async function readAssistantFile(owner: string, id: string) {
  if (!isMcpAdmin(owner)) throw new Error("관리자 권한을 확인해주세요.");
  z.string().uuid().parse(id);
  const [row] = await query<AssistantAttachment>(
    "select * from assistant_attachments where id=$1 and owner=$2",
    [id, owner],
  );
  if (!row) throw new Error("파일을 찾을 수 없어요.");
  return row;
}
export async function deleteAssistantFile(owner: string, id: string) {
  const row = await readAssistantFile(owner, id);
  await transaction(async () => {
    await lock("assistant-files:" + row.thread_id);
    const fresh = await readAssistantFile(owner, id);
    const used = await query(
      "select id from assistant_turns where owner=$1 and thread_id=$2 and attachment_ids ? $3 limit 1",
      [owner, row.thread_id, id],
    );
    if (used.length || Object.keys(fresh.links).length)
      throw new Error("이미 대화에 보낸 파일은 삭제할 수 없어요.");
    await execute(
      "delete from assistant_attachments where id=$1 and owner=$2",
      [id, owner],
    );
  });
  await removeObjects([row.storage_name]);
}
export async function assistantFileContext(owner: string, threadId: string) {
  const refs = await query<{ attachment_ids: string[] }>(
    "select attachment_ids from assistant_turns where owner=$1 and thread_id=$2 order by created_at desc limit 100",
    [owner, threadId],
  );
  const ids = [...new Set(refs.flatMap((r) => r.attachment_ids))].slice(0, 12);
  const files = await ownedAssistantFiles(owner, threadId, ids);
  let remaining = 60000;
  const attachments = files.map((f) => {
    const text = (f.extracted || "").slice(0, Math.min(12000, remaining));
    remaining -= text.length;
    return {
      ...publicAssistantFile(f),
      text,
      truncated: text.length < (f.extracted || "").length,
    };
  });
  const images = [];
  for (const f of files
    .filter((f) => f.mime.startsWith("image/"))
    .slice(0, 4)) {
    let data = await sharp(await getObject(f.storage_name), {
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75 })
      .toBuffer();
    if (data.length > 300000)
      data = await sharp(data)
        .resize({ width: 800, height: 800, fit: "inside" })
        .jpeg({ quality: 60 })
        .toBuffer();
    if (data.length > 300000)
      throw new Error("이미지 용량이 커요. 나누어 첨부해주세요.");
    images.push({
      id: f.id,
      name: f.name,
      url: "data:image/jpeg;base64," + data.toString("base64"),
    });
  }
  return { attachments, images };
}
