import { z } from "zod";
import {
  query,
  get,
  list,
  create,
  update,
  transaction,
  lock,
  audit,
} from "./db";
import { lockCatalog } from "./domain";
import { saveCustomerFile } from "./customer-files";
import { bytes } from "./assets";
import type { RecordData } from "./types";
import { WorkflowError } from "./workflow-http";
async function owner(advertiserId: string) {
  const [row] = await query<{ data: RecordData }>(
    "select r.data from advertiser_accounts a join records r on r.id=a.customer_id and r.kind='customers' where a.id=$1 and coalesce(r.data->>'deletedAt','')=''",
    [advertiserId],
  );
  const customer = row?.data;
  if (!customer)
    throw new WorkflowError(
      "연결된 고객 정보를 확인해주세요. 담당자에게 문의해주세요.",
      403,
    );
  return customer;
}
async function ownedProduct(advertiserId: string, id: string) {
  const c = await owner(advertiserId),
    p = await get(z.uuid().parse(id));
  if (p?.kind !== "products" || p.customerId !== c.id || p.deletedAt)
    throw new WorkflowError("제품을 찾을 수 없습니다.", 404);
  return p;
}
const text = z.string().trim().max(5000).default("");
const schema = z.object({
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "제품명을 입력해주세요.").max(200),
  facts: text,
  claims: text,
  forbidden: text,
  preserve: text,
  links: z
    .array(
      z
        .string()
        .url()
        .max(2000)
        .refine((v) => /^https?:\/\//i.test(v)),
    )
    .max(5)
    .default([]),
});
function publicProduct(p: Record<string, unknown>) {
  return {
    id: p.id,
    version: p.version,
    name: p.name,
    facts: p.facts || "",
    claims: p.claims || "",
    forbidden: p.forbidden || "",
    preserve: p.preserve || "",
    links: p.links || [],
    updatedAt: p.updatedAt,
  };
}
export async function advertiserProducts(advertiserId: string) {
  const c = await owner(advertiserId);
  const [productRows, fileRows] = await Promise.all([
    query<{ data: RecordData }>(
      "select data from records where kind='products' and data->>'customerId'=$1 and coalesce(data->>'deletedAt','')='' order by created_at desc,id",
      [c.id],
    ),
    query<{ data: RecordData }>(
      "select jsonb_build_object('id',a.id,'name',a.data->'name','size',a.data->'size','mime',a.data->'mime','productId',a.data->'productId') as data from records a join records p on p.id=a.data->>'productId' and p.kind='products' where a.kind='assets' and a.data->>'customerId'=$1 and p.data->>'customerId'=$1 and coalesce(p.data->>'deletedAt','')='' and coalesce(a.data->>'projectId','')='' and coalesce(a.data->>'deletedAt','')='' and coalesce(a.data->>'current','true')<>'false' order by a.created_at desc,a.id",
      [c.id],
    ),
  ]);
  const products = productRows.map((r) => r.data),
    files = fileRows.map((r) => r.data);
  return products.map((p) => ({
    ...publicProduct(p),
    files: files
      .filter((a) => a.productId === p.id)
      .map((a) => ({ id: a.id, name: a.name, size: a.size, mime: a.mime })),
  }));
}
export async function saveAdvertiserProduct(
  advertiserId: string,
  input: unknown,
) {
  const b = schema.parse(input);
  return transaction(async () => {
    await lockCatalog();
    await lock("save:products");
    const c = await owner(advertiserId);
    let old = b.id ? await ownedProduct(advertiserId, b.id) : null;
    if (old && old.version !== b.version)
      throw new WorkflowError(
        "제품 정보가 변경됐어요. 새로고침 후 다시 수정해주세요.",
        409,
      );
    if (old) {
      // Freeze the exact master used by existing projects before editing the library.
      for (const project of (await list("projects")).filter(
        (p) =>
          p.customerId === c.id &&
          p.productId === old!.id &&
          !p.productLibrarySnapshot,
      )) {
        await update(
          project.id,
          {
            productLibrarySnapshot: old,
            productLibraryUpdatedAt: new Date().toISOString(),
          },
          project.version,
        );
      }
    }
    const { id, version, ...fields } = b;
    const p = old
      ? await update(old.id, fields, b.version)
      : await create("products", { ...fields, customerId: c.id, notes: "" });
    await audit(advertiserId, "advertiser-product-saved", p.id, {
      customerId: c.id,
    });
    return publicProduct(p);
  });
}
export async function addAdvertiserProductFile(
  advertiserId: string,
  id: string,
  name: string,
  buffer: Buffer,
) {
  return transaction(async () => {
    await lockCatalog();
    await lock("save:products");
    const p = await ownedProduct(advertiserId, id);
    const count = (await list("assets")).filter(
      (a) => a.productId === p.id && a.current !== false,
    ).length;
    if (count >= 30)
      throw new WorkflowError("제품별 자료는 최대 30개까지 등록할 수 있어요.");
    const file = await saveCustomerFile(
      { customerId: String(p.customerId), category: "reference", name, buffer },
      advertiserId,
    );
    await update(file.id, {
      productId: p.id,
      uploadedByAdvertiser: advertiserId,
    });
    return { id: file.id, name: file.name };
  });
}
export async function advertiserProductFile(advertiserId: string, id: string) {
  const file = await get(z.uuid().parse(id));
  if (
    file?.kind !== "assets" ||
    !file.productId ||
    file.projectId ||
    file.deletedAt ||
    file.current === false
  )
    throw new WorkflowError("자료를 찾을 수 없습니다.", 404);
  const product = await ownedProduct(advertiserId, String(file.productId));
  if (file.customerId !== product.customerId)
    throw new WorkflowError("자료를 찾을 수 없습니다.", 404);
  return { file, buffer: await bytes(file) };
}
