import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { create, get, update } from "../src/lib/db";
import { productBasis } from "../src/lib/product-understanding";
import { refreshKeywordMetrics } from "../src/lib/keyword-metrics";
import { command } from "../src/lib/domain";
import {
  issueReportLink,
  customerReport,
  reportWorkbook,
} from "../src/lib/customer-reports";
test("네이버 수집 결과는 내부 확인 후 공유하고 새 조회·입력 변경은 공개 승인을 무효화", async () => {
  const c = await create("customers", { name: "네이버 QA 고객" }),
    product = await create("products", { customerId: c.id, name: "떡간식" });
  const p = await create("projects", {
    name: "네이버 분석",
    customerId: c.id,
    productId: product.id,
    status: "planning",
  });
  const approvedAt = new Date().toISOString();
  await update(p.id, {
    productUnderstanding: {
      profile: {
        name: "떡간식",
        category: "간식",
        features: "간편 조리",
        target: "",
        salesScope: "전국 배송",
        goal: "인지도",
        forbidden: "",
      },
      sourceHash: (await productBasis(p)).hash,
      approvedAt,
      approvedBy: "qa",
    },
    researchProductApproval: approvedAt,
    recommendedKeywords: {
      main: ["떡간식"],
      secondary: ["간편간식"],
      reason: "제품 관련성",
      candidates: ["떡간식", "간편간식"].map((keyword) => ({
        keyword,
        intent: "간식 탐색",
        reason: "제품 관련성",
        evidenceUrls: ["https://example.com/product"],
      })),
      excluded: [],
      volumeVerified: false,
    },
  });
  const real = globalThis.fetch,
    previousId = process.env.NAVER_API_HUB_CLIENT_ID,
    previousSecret = process.env.NAVER_API_HUB_CLIENT_SECRET;
  process.env.NAVER_API_HUB_CLIENT_ID = "test";
  process.env.NAVER_API_HUB_CLIENT_SECRET = "test";
  let change = false;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://naverapihub.apigw.ntruss.com/"))
      return real(url, init);
    if (change) {
      change = false;
      await update(p.id, { materialNotes: "입력 변경" });
    }
    return String(url).includes("search-trend")
      ? Response.json({
          results: [
            { title: "떡간식", data: [{ period: "2026-10-17", ratio: 40 }] },
            { title: "간편간식", data: [] },
          ],
        })
      : Response.json({ total: 1000, items: [] });
  };
  try {
    const link = await issueReportLink(c.id, 1, "qa");
    await refreshKeywordMetrics(p.id, (await get(p.id))!.version, "qa");
    assert.equal(
      (await customerReport(link.token))!.projects[0].keywords,
      null,
    );
    let latest = (await get(p.id))!;
    await command(
      "keyword-analysis-confirm",
      {
        id: p.id,
        version: latest.version,
        main: ["떡간식"],
        secondary: [],
        reason: "제품 형태에 맞는 키워드",
      },
      "qa",
      crypto.randomUUID(),
    );
    let report = (await customerReport(link.token))!;
    assert.equal(report.projects[0].keywords!.metrics!.rows.length, 1);
    assert.equal(report.projects[0].keywords!.metrics!.rows[0].blogTotal, 1000);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      (await reportWorkbook(report)) as unknown as ExcelJS.Buffer,
    );
    assert.equal(
      book.getWorksheet("네이버 검색 데이터")!.getCell("C2").value,
      1000,
    );
    await refreshKeywordMetrics(p.id, (await get(p.id))!.version, "qa");
    report = (await customerReport(link.token))!;
    assert.equal(report.projects[0].keywords, null);
    const before = (await get(p.id))!.keywordMetrics;
    change = true;
    await assert.rejects(
      refreshKeywordMetrics(p.id, (await get(p.id))!.version, "qa"),
      /변경/,
    );
    assert.deepEqual((await get(p.id))!.keywordMetrics, before);
  } finally {
    globalThis.fetch = real;
    if (previousId === undefined) delete process.env.NAVER_API_HUB_CLIENT_ID;
    else process.env.NAVER_API_HUB_CLIENT_ID = previousId;
    if (previousSecret === undefined)
      delete process.env.NAVER_API_HUB_CLIENT_SECRET;
    else process.env.NAVER_API_HUB_CLIENT_SECRET = previousSecret;
  }
});
