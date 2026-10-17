import { createHash } from "node:crypto";
import { get, list } from "./db";
import type { RecordData } from "./types";

import {
  productProfileSchema,
  missingProductFields,
  type ProductUnderstanding,
} from "./product-understanding-schema";
export * from "./product-understanding-schema";
export async function productBasis(project: RecordData) {
  const product = project.productId
    ? await get(String(project.productId))
    : null;
  const customer = project.customerId
    ? await get(String(project.customerId))
    : null;
  const sources = (await list("assets"))
    .filter(
      (a) =>
        a.projectId === project.id &&
        a.category === "source" &&
        a.analysisExcluded !== true &&
        a.current !== false,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const knowledge = project.knowledge as
    { product?: unknown; customer?: unknown } | undefined;
  const company = (customer || knowledge?.customer || {}) as Record<
    string,
    unknown
  >;
  const data = {
    product: product || knowledge?.product || {},
    customer: {
      name: company.name,
      brand: company.brand,
      tone: company.tone,
      target: company.target,
      forbidden: company.forbidden,
      notes: company.notes,
    },
    materialNotes: project.materialNotes || "",
    instructions: project.instructions || "",
    preferredKeywords: project.preferredKeywords || "",
    productLinks: project.productLinks || [],
    sources: sources.map((a) => ({
      id: a.id,
      name: a.name,
      mime: a.mime,
      hash: a.hash,
      version: a.version,
      extracted: a.extracted,
    })),
  };
  return {
    data,
    sources,
    hash: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}
export async function requireConfirmedProduct(project: RecordData) {
  const u = project.productUnderstanding as ProductUnderstanding | undefined;
  if (
    !u?.approvedAt ||
    !u.approvedBy ||
    u.sourceHash !== (await productBasis(project)).hash
  )
    throw new Error(
      "자료를 정리하고 제품 정보를 확인·확정한 뒤 키워드를 분석하세요. 자료가 바뀌면 다시 확인해주세요.",
    );
  const profile = productProfileSchema.parse(u.profile);
  if (missingProductFields(profile).length)
    throw new Error("제품 정보의 필수 확인 항목을 입력하세요.");
  return u;
}
export async function requireResearchSnapshot(job: RecordData) {
  const current = await get(String(job.projectId));
  if (!current) throw new Error("프로젝트를 확인하세요.");
  const snapshot = (job.snapshot as { project: RecordData }).project;
  const u = await requireConfirmedProduct(current);
  if (JSON.stringify(u) !== JSON.stringify(snapshot.productUnderstanding))
    throw new Error(
      "분석 중 제품 확인 내용이 변경되었습니다. 다시 분석하세요.",
    );
  return current;
}
