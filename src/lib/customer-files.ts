import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { requireRecord } from "./domain";
import { create, audit, transaction } from "./db";
import { putObject, removeObjects } from "./storage";
import { detectMime, extractSheet, bytes, saveAsset } from "./assets";

export const customerFileCategory = z.enum([
  "business_registration",
  "reference",
  "intake",
]);
export async function saveCustomerFile(
  input: {
    customerId: string;
    category: string;
    name: string;
    buffer: Buffer;
  },
  actor: string,
) {
  const category = customerFileCategory.parse(input.category);
  await requireRecord(input.customerId, "customers");
  if (!input.buffer.length || input.buffer.length > 4 * 1024 * 1024)
    throw new Error("파일당 4MB 이하의 자료를 등록하세요.");
  const name = path.basename(input.name.replaceAll("\\", "/"));
  const ext = path.extname(name).slice(1).toLowerCase();
  const mime = detectMime(input.buffer, ext);
  if (
    category === "business_registration" &&
    mime !== "application/pdf" &&
    !mime.startsWith("image/")
  )
    throw new Error("사업자등록증은 PDF 또는 이미지로 등록하세요.");
  if (category === "intake" && !["xlsx", "csv"].includes(ext))
    throw new Error("고객 작성본은 XLSX 또는 CSV로 등록하세요.");
  if (
    !["pdf", "png", "jpg", "jpeg", "webp", "xlsx", "csv", "txt", "md"].includes(
      ext,
    )
  )
    throw new Error("지원하지 않는 참고자료 형식입니다.");
  const extracted = await extractSheet(input.buffer, ext);
  const storageName = randomUUID() + "." + ext;
  await putObject(storageName, input.buffer, mime);
  try {
    return await transaction(async () => {
      const row = await create("assets", {
        customerId: input.customerId,
        projectId: null,
        taskId: null,
        category,
        name,
        mime,
        storageName,
        size: input.buffer.length,
        hash: createHash("sha256").update(input.buffer).digest("hex"),
        current: true,
        extracted,
        text: null,
      });
      await audit(actor, "customer-file-created", row.id, {
        customerId: input.customerId,
        category,
      });
      return row;
    });
  } catch (e) {
    await removeObjects([storageName]).catch(() => {});
    throw e;
  }
}

export async function copyCustomerFile(
  assetId: string,
  projectId: string,
  actor: string,
) {
  const source = await requireRecord(assetId, "assets");
  const project = await requireRecord(projectId, "projects");
  if (
    source.projectId ||
    source.customerId !== project.customerId ||
    !["reference", "intake"].includes(String(source.category))
  )
    throw new Error(
      "같은 고객의 참고자료·작성본만 프로젝트로 복사할 수 있습니다.",
    );
  return saveAsset(
    {
      projectId,
      category: "source",
      name: String(source.name),
      buffer: await bytes(source),
      extracted: source.extracted as string | null,
    },
    actor,
  );
}
