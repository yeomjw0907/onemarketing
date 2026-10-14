import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
const { save, command, quote, projectCosts } =
  await import("../src/lib/domain");
const { get, list, create } = await import("../src/lib/db");
const actor = "test@local";
test("가격 스냅샷, 슬롯 중복 방지, 기획 승인, 비용·정산 제약", async () => {
  const c = await save("customers", { name: "테스트 고객" }, actor);
  const p = await save(
    "products",
    { name: "제품", customerId: c.id, facts: "실제 확인 정보" },
    actor,
  );
  const price = await save(
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
  assert.equal(
    (await quote([{ priceId: price.id, quantity: 2 }], 1000)).margin,
    47000,
  );
  const contract = await save(
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
  await save(
    "prices",
    { ...price, sale: 50000, payout: 10000 },
    actor,
    price.id,
    price.version,
  );
  assert.equal((await get(contract.id))?.sale, 30000);
  assert.equal(contract.slotCount, 24);
  const project = await save(
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
  await assert.rejects(
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
  await assert.rejects(
    command(
      "project-stage",
      { id: project.id, version: 1, status: "planning" },
      actor,
      "no-material",
    ),
    /자료/,
  );
  await command(
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
  const r = await command(
    "project-stage",
    { id: project.id, version: 2, status: "planning" },
    actor,
    "stage",
  );
  // 같은 명령 키는 다시 실행하지 않고 첫 결과를 돌려준다.
  assert.equal(
    (
      await command(
        "project-stage",
        { id: project.id, version: 2, status: "planning" },
        actor,
        "stage",
      )
    ).version,
    r.version,
  );
  await assert.rejects(
    command(
      "project-stage",
      { id: project.id, version: r.version, status: "ready" },
      actor,
      "bad-stage",
    ),
    /단계/,
  );
  await assert.rejects(
    command("settle", { id: project.id, version: r.version }, actor, "settle"),
    /운영 완료/,
  );
  const task = (await list("tasks"))[0];
  assert.equal(task.payout, 5000);
  await create("costs", {
    projectId: project.id,
    category: "ai",
    amount: 1000,
    confirmed: true,
  });
  assert.equal((await projectCosts((await get(project.id))!)).actual, 6000);
  await assert.rejects(
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
test("미정 단가와 과도한 할인 차단", async () => {
  const c = await save("customers", { name: "다른 고객" }, actor);
  const price = await save(
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
  assert.equal(
    (await quote([{ priceId: price.id, quantity: 1 }])).margin,
    null,
  );
  await assert.rejects(
    quote([{ priceId: price.id, quantity: 1 }], 20000),
    /할인/,
  );
  await assert.rejects(
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
test("VAT 포함 입력은 공급가액으로 마진 계산하고 지급 후 취소한 보수는 원가 유지", async () => {
  const c = await save("customers", { name: "세금 검증" }, actor);
  const product = await save(
    "products",
    { name: "제품", customerId: c.id },
    actor,
  );
  const price = await save(
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
  const contract = await save(
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
  const p = await save(
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
  const t = (await list("tasks")).find((t) => t.projectId === p.id)!;
  await command(
    "payout",
    { id: t.id, version: t.version, paid: true },
    actor,
    "pay-before-cancel",
  );
  await command(
    "cancel-task",
    { id: t.id, version: (await get(t.id))!.version, note: "지급 후 취소" },
    actor,
    "cancel-paid",
  );
  assert.equal((await projectCosts(p)).actual, 5000);
});
