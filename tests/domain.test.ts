import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "one-marketing-test-"));
const { save, command, quote, projectCosts } =
  await import("../src/lib/domain");
const { get, list, create } = await import("../src/lib/db");
const actor = "test@local";
test("가격 스냅샷, 슬롯 중복 방지, 기획 승인, 비용·정산 제약", () => {
  const c = save("customers", { name: "테스트 고객" }, actor);
  const p = save(
    "products",
    { name: "제품", customerId: c.id, facts: "실제 확인 정보" },
    actor,
  );
  const price = save(
    "prices",
    {
      name: "블로그",
      channel: "blog",
      sale: 30000,
      payout: 5000,
      aiEstimate: 1000,
      images: 1,
      duration: 0,
      mode: "slideshow",
      revisions: 1,
    },
    actor,
  );
  assert.equal(quote([{ priceId: price.id, quantity: 2 }], 1000).margin, 47000);
  const contract = save(
    "contracts",
    {
      name: "계약",
      customerId: c.id,
      lines: [{ priceId: price.id, quantity: 1 }],
      months: 6,
      setsPerMonth: 4,
      startMonth: "2026-10",
    },
    actor,
  );
  save(
    "prices",
    { ...price, sale: 50000, payout: 10000 },
    actor,
    price.id,
    price.version,
  );
  assert.equal(get(contract.id)?.sale, 30000);
  assert.equal(contract.slotCount, 24);
  const project = save(
    "projects",
    {
      name: "작업",
      contractId: contract.id,
      slot: 0,
      productId: p.id,
      due: "2026-10-30",
      budget: 10000,
    },
    actor,
  );
  assert.throws(
    () =>
      save(
        "projects",
        {
          name: "중복",
          contractId: contract.id,
          slot: 0,
          productId: p.id,
          due: "2026-10-30",
          budget: 10000,
        },
        actor,
      ),
    /이미 시작/,
  );
  assert.throws(
    () =>
      command(
        "project-stage",
        { id: project.id, version: 1, status: "planning" },
        actor,
        "no-material",
      ),
    /자료/,
  );
  command(
    "project-notes",
    {
      id: project.id,
      version: 1,
      materialNotes: "자료 확인",
      instructions: "",
      budget: 10000,
    },
    actor,
    "notes",
  );
  const r = command(
    "project-stage",
    { id: project.id, version: 2, status: "planning" },
    actor,
    "stage",
  );
  assert.equal(
    command(
      "project-stage",
      { id: project.id, version: 2, status: "planning" },
      actor,
      "stage",
    ).version,
    r.version,
  );
  assert.throws(
    () =>
      command(
        "project-stage",
        { id: project.id, version: r.version, status: "ready" },
        actor,
        "bad-stage",
      ),
    /단계/,
  );
  assert.throws(
    () =>
      command(
        "settle",
        { id: project.id, version: r.version },
        actor,
        "settle",
      ),
    /운영 완료/,
  );
  const task = list("tasks")[0];
  assert.equal(task.payout, 5000);
  create("costs", {
    projectId: project.id,
    category: "ai",
    amount: 1000,
    confirmed: true,
  });
  assert.equal(projectCosts(get(project.id)!).actual, 6000);
  assert.throws(
    () =>
      command(
        "publication",
        {
          id: task.id,
          version: task.version,
          link: "https://blog.naver.com/example",
          verified: true,
        },
        actor,
        "link",
      ),
    /전달/,
  );
});
test("미정 단가와 과도한 할인 차단", () => {
  const c = save("customers", { name: "다른 고객" }, actor);
  const price = save(
    "prices",
    {
      name: "클립",
      channel: "clip",
      sale: 10000,
      payout: null,
      aiEstimate: 1000,
      images: 3,
      duration: 15,
      mode: "slideshow",
      revisions: 1,
    },
    actor,
  );
  assert.equal(quote([{ priceId: price.id, quantity: 1 }]).margin, null);
  assert.throws(
    () => quote([{ priceId: price.id, quantity: 1 }], 20000),
    /할인/,
  );
  assert.throws(
    () =>
      save(
        "contracts",
        {
          name: "미확정",
          customerId: c.id,
          lines: [{ priceId: price.id, quantity: 1 }],
          months: 1,
          setsPerMonth: 1,
          startMonth: "2026-10",
        },
        actor,
      ),
    /단가/,
  );
});
test("VAT 포함 입력은 공급가액으로 마진 계산하고 지급 후 취소한 보수는 원가 유지", () => {
  const c = save("customers", { name: "세금 검증" }, actor);
  const product = save("products", { name: "제품", customerId: c.id }, actor);
  const price = save(
    "prices",
    {
      name: "블로그",
      channel: "blog",
      sale: 33000,
      payout: 5000,
      aiEstimate: 1000,
      images: 1,
      duration: 0,
      mode: "slideshow",
      revisions: 1,
    },
    actor,
  );
  const contract = save(
    "contracts",
    {
      name: "VAT 포함",
      customerId: c.id,
      lines: [{ priceId: price.id, quantity: 1 }],
      months: 1,
      setsPerMonth: 1,
      startMonth: "2026-10",
      vatIncluded: true,
    },
    actor,
  );
  assert.equal(contract.sale, 30000);
  assert.equal(contract.vat, 3000);
  assert.equal(contract.gross, 33000);
  assert.equal(contract.margin, 24000);
  const p = save(
    "projects",
    {
      name: "보수 검증",
      contractId: contract.id,
      slot: 0,
      productId: product.id,
      due: "2026-10-30",
      budget: 10000,
    },
    actor,
  );
  const t = list("tasks").find((t) => t.projectId === p.id)!;
  command(
    "payout",
    { id: t.id, version: t.version, paid: true },
    actor,
    "pay-before-cancel",
  );
  command(
    "cancel-task",
    { id: t.id, version: get(t.id)!.version, note: "지급 후 취소" },
    actor,
    "cancel-paid",
  );
  assert.equal(projectCosts(p).actual, 5000);
});
