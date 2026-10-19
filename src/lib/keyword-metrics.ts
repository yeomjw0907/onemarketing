import { get, update, transaction, lock, audit } from "./db";
import { requireConfirmedProduct } from "./product-understanding";
import { keywordPlanSchema } from "./keyword-research";
import { collectNaverKeywordMetrics } from "./naver-keywords";
export async function refreshKeywordMetrics(
  id: string,
  version: number,
  actor: string,
) {
  const project = await get(id);
  if (
    project?.kind !== "projects" ||
    project.hold ||
    project.settled ||
    ["completed", "cancelled"].includes(String(project.status))
  )
    throw new Error("진행 중 프로젝트를 선택하세요.");
  if (project.version !== version)
    throw new Error("새로고침 후 다시 조회하세요.");
  const u = await requireConfirmedProduct(project),
    plan = keywordPlanSchema.parse(project.recommendedKeywords);
  if (project.researchProductApproval !== u.approvedAt)
    throw new Error("확정한 제품 정보로 키워드를 먼저 분석하세요.");
  const metrics = await collectNaverKeywordMetrics([
    ...plan.main,
    ...plan.secondary,
  ]);
  return transaction(async () => {
    await lock("project-operations:" + id);
    await lock("assets:" + id);
    const latest = await get(id);
    if (!latest || latest.version !== version || latest.hold || latest.settled)
      throw new Error("조회 중 프로젝트가 변경되었습니다. 다시 조회하세요.");
    await requireConfirmedProduct(latest);
    const result = await update(
      id,
      { keywordMetrics: metrics, confirmedKeywordAnalysis: null },
      version,
    );
    await audit(actor, "keyword-metrics-refreshed", id, {
      measuredAt: metrics.measuredAt,
    });
    return result;
  });
}
