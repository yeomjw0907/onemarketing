import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { create, get, update } from "../src/lib/db";
import { command } from "../src/lib/domain";
import { enqueue, claimJob } from "../src/lib/jobs";
import { executeProviderJob } from "../src/lib/providers";
import { saveCustomerFile, copyCustomerFile } from "../src/lib/customer-files";
import { saveAsset } from "../src/lib/assets";
import {
  productBasis,
  requireConfirmedProduct,
} from "../src/lib/product-understanding";
import {
  issueReportLink,
  customerReport,
  reportWorkbook,
} from "../src/lib/customer-reports";

const actor = "product-qa@local";
const profile = {
  name: "Rice Snack",
  category: "떡 간식",
  features: "전자레인지 조리",
  target: "",
  salesScope: "전국 온라인 배송",
  goal: "제품 인지도",
  forbidden: "효능 단정 금지",
};
const draft = {
  profile: { ...profile, goal: "" },
  evidence: [
    { field: "category", source: "product.xlsx", detail: "제품 시트 B2" },
  ],
  questions: [{ field: "goal", question: "이번 캠페인의 목표는 무엇인가요?" }],
  notes: "회사 전체의 다른 제품과 구분했습니다. 내부 검토 메모",
};
async function fixture() {
  process.env.ANTHROPIC_API_KEY = "qa-not-real";
  const c = await create("customers", { name: "Product QA", brand: "QA" });
  const product = await create("products", {
    customerId: c.id,
    name: profile.name,
    facts: profile.features,
  });
  const p = await create("projects", {
    customerId: c.id,
    productId: product.id,
    name: "제품 분석 QA",
    status: "planning",
    budget: 100000,
    knowledge: { customer: c, product },
  });
  return { c, product, p };
}
async function act(
  action: string,
  pid: string,
  data: Record<string, unknown> = {},
) {
  return command(
    action,
    { id: pid, version: (await get(pid))!.version, ...data },
    actor,
    crypto.randomUUID(),
  );
}
async function job(pid: string, type: "product-review" | "research") {
  return enqueue(
    { projectId: pid, type, estimate: 1000, key: crypto.randomUUID() },
    actor,
  );
}

test("PDF 소개서·엑셀 자료 정리 → 필요한 질문 → 내부 제품 확인 → 키워드 확정 후에만 고객 공유", async () => {
  const { c, p } = await fixture();
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Company introduction - multiple product lines");
  const company = await saveCustomerFile(
    {
      customerId: c.id,
      category: "reference",
      name: "company.pdf",
      buffer: Buffer.from(await pdf.save()),
    },
    actor,
  );
  await copyCustomerFile(company.id, p.id, actor);
  const book = new ExcelJS.Workbook();
  book.addWorksheet("제품").addRows([
    ["Product", "Category"],
    ["Rice Snack", "Rice cake"],
  ]);
  const sheet = await saveCustomerFile(
    {
      customerId: c.id,
      category: "intake",
      name: "product.xlsx",
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    },
    actor,
  );
  await copyCustomerFile(sheet.id, p.id, actor);
  await assert.rejects(job(p.id, "research"), /제품 정보/);
  const review = await job(p.id, "product-review");
  const realFetch = globalThis.fetch;
  let captured: any;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://api.anthropic.com/v1/messages")
      return realFetch(url, init);
    captured = JSON.parse(String(init?.body));
    return Response.json({
      id: "qa-review",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 100 },
      content: [{ type: "text", text: JSON.stringify(draft) }],
    });
  };
  try {
    await executeProviderJob(review);
  } finally {
    globalThis.fetch = realFetch;
  }
  await update(review.id, { status: "succeeded" });
  assert.ok(
    captured.messages[0].content.some(
      (b: any) =>
        b.type === "document" &&
        b.title === "company.pdf" &&
        b.source.media_type === "application/pdf",
    ),
  );
  assert.match(JSON.stringify(captured), /Rice cake/);
  assert.match(JSON.stringify(captured), /다른 제품/);
  assert.equal(
    ((await get(p.id))!.productUnderstanding as any).questions.length,
    1,
  );
  await assert.rejects(job(p.id, "research"), /제품 정보/);
  await assert.rejects(
    act("product-understanding-confirm", p.id, {
      profile: { ...profile, goal: "" },
    }),
    /캠페인 목표/,
  );
  await act("product-understanding-confirm", p.id, { profile });
  await requireConfirmedProduct((await get(p.id))!);
  const pending = await job(p.id, "research");
  const link = await issueReportLink(c.id, 7, actor);
  const plan = {
    main: ["떡간식"],
    secondary: ["간편간식"],
    reason: "제품 형태와 조리 방식",
    candidates: [
      {
        keyword: "떡간식",
        intent: "제품 탐색",
        reason: "제품 관련성",
        evidenceUrls: ["https://example.com/product"],
      },
      {
        keyword: "간편간식",
        intent: "간편 조리",
        reason: "사용 상황",
        evidenceUrls: ["https://example.com/product"],
      },
    ],
    excluded: [],
    volumeVerified: false,
  };
  await update(p.id, {
    recommendedKeywords: plan,
    research: "고객에게 숨길 내부 분석",
    researchProductApproval: ((await get(p.id))!.productUnderstanding as any)
      .approvedAt,
  });
  let report = (await customerReport(link.token))!;
  assert.equal(report.projects[0].keywords, null);
  await assert.rejects(
    act("keyword-analysis-confirm", p.id, {
      main: ["다이어트"],
      secondary: [],
      reason: "미확인",
    }),
    /분석 근거/,
  );
  await act("keyword-analysis-confirm", p.id, {
    main: plan.main,
    secondary: plan.secondary,
    reason: "떡 간식과 간편 조리라는 제품 특성에 맞춰 선정했습니다.",
  });
  report = (await customerReport(link.token))!;
  assert.deepEqual(report.projects[0].keywords?.main, ["떡간식"]);
  assert.doesNotMatch(
    JSON.stringify(report),
    /내부 분석|내부 검토 메모|company.pdf|approvedBy/,
  );
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(
    (await reportWorkbook(report)) as unknown as ExcelJS.Buffer,
  );
  assert.equal(
    exported.getWorksheet("확정 키워드")!.getCell("C2").value,
    "떡간식",
  );
  await saveAsset(
    {
      projectId: p.id,
      category: "source",
      name: "new-notes.txt",
      buffer: Buffer.from("변경된 제품 소개"),
      extracted: "변경된 제품 소개",
    },
    actor,
  );
  await assert.rejects(
    requireConfirmedProduct((await get(p.id))!),
    /자료가 바뀌면/,
  );
  assert.equal((await customerReport(link.token))!.projects[0].keywords, null);
  assert.equal(await claimJob("stale-qa"), null);
  assert.equal((await get(pending.id))!.status, "cancelled");
});

test("정리·분석 중 입력이 바뀌면 이전 응답을 적용하지 않고 링크는 http(s)만 허용", async () => {
  const { p } = await fixture();
  await assert.rejects(
    act("product-links", p.id, { links: ["file:///secret"] }),
  );
  await act("product-links", p.id, { links: ["https://example.com/product"] });
  const review = await job(p.id, "product-review");
  await update(review.id, {
    productLinkResearch: "읽을 수 없어 추가 자료 필요",
    productLinkSources: [],
    outputText: JSON.stringify({ ...draft, evidence: [] }),
  });
  await update(p.id, { materialNotes: "추가 확인 사항" });
  await assert.rejects(executeProviderJob(review), /자료가 변경/);
  assert.equal((await get(p.id))!.productUnderstanding, null);
  await update(review.id, { status: "failed" });
  const basis = await productBasis((await get(p.id))!);
  await update(p.id, {
    productUnderstanding: {
      ...draft,
      profile,
      sourceHash: basis.hash,
      approvedAt: new Date().toISOString(),
      approvedBy: actor,
    },
  });
  const research = await job(p.id, "research");
  await act("product-understanding-confirm", p.id, {
    profile: { ...profile, goal: "구매 유도" },
  });
  await assert.rejects(executeProviderJob(research), /제품 확인 내용/);
});

test("읽지 못하는 소개서는 분석에서 제외할 수 있고 필수 누락 질문을 서버가 보완한다", async () => {
  const { p } = await fixture();
  const broken = await saveAsset(
    {
      projectId: p.id,
      category: "source",
      name: "broken.pdf",
      buffer: Buffer.from("%PDF-1.7\ninvalid"),
    },
    actor,
  );
  let review = await job(p.id, "product-review");
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://api.anthropic.com/v1/messages")
      return realFetch(url, init);
    calls++;
    return Response.json({
      id: "qa-empty",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [
        {
          type: "text",
          text: JSON.stringify({ ...draft, evidence: [], questions: [] }),
        },
      ],
    });
  };
  try {
    await assert.rejects(executeProviderJob(review), /읽을 수 없는 PDF/);
    assert.equal(calls, 0);
    await update(review.id, { status: "failed" });
    await act("product-source-toggle", broken.id, { excluded: true });
    review = await job(p.id, "product-review");
    assert.ok(!(review.snapshot as any).sourceAssets.includes(broken.id));
    await executeProviderJob(review);
    assert.equal(calls, 1);
    assert.ok(
      ((await get(p.id))!.productUnderstanding as any).questions.some(
        (q: any) => q.field === "goal",
      ),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("제품 링크에서 출처를 확보하지 못하면 내용을 추측하지 않고 추가 확인으로 넘긴다", async () => {
  const { p } = await fixture();
  await act("product-links", p.id, { links: ["https://example.com/blocked"] });
  const review = await job(p.id, "product-review"),
    realFetch = globalThis.fetch;
  let calls = 0;
  let prompt = "";
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://api.anthropic.com/v1/messages")
      return realFetch(url, init);
    calls++;
    prompt = String(init?.body);
    return Response.json({
      id: "qa-blocked-" + calls,
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 10 },
      content: [
        {
          type: "text",
          text:
            calls === 1
              ? "로그인 페이지여서 확인 불가"
              : JSON.stringify({
                  ...draft,
                  evidence: [],
                  notes: "링크를 확인하지 못해 등록 정보만 정리했습니다.",
                }),
        },
      ],
    });
  };
  try {
    await executeProviderJob(review);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 2);
  assert.match(prompt, /제품 링크 내용을 확인하지 못/);
  const result = (await get(p.id))!.productUnderstanding as any;
  assert.equal(result.approvedAt, null);
  assert.ok(result.questions.some((q: any) => q.field === "goal"));
});
