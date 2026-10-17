import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { save, command } from "../src/lib/domain";
import { create, get } from "../src/lib/db";
import { saveQuote, confirmQuote } from "../src/lib/quote-workflow";
const actor = "catalog@test.local";
const remove = (action: string, row: { id: string; version: number }) =>
  command(action, { id: row.id, version: row.version }, actor, randomUUID());
async function fixture() {
  const c = await save("customers", { name: "삭제 QA 고객" }, actor);
  const p = await save(
    "products",
    { name: "삭제 QA 제품", customerId: c.id },
    actor,
  );
  const price = await save(
    "prices",
    {
      name: "블로그",
      channel: "blog",
      sale: 10000,
      payout: 3000,
      aiEstimate: 0,
      images: 3,
      duration: 0,
      mode: "slideshow",
      revisions: 1,
    },
    actor,
  );
  const input = {
    name: "삭제 전 견적",
    customerId: c.id,
    productId: p.id,
    start: "2026-11-01",
    end: "2026-11-30",
    blog: 1,
    clip: 0,
    blogPriceId: price.id,
  };
  const draft = await saveQuote(input, actor);
  return { c, p, input, draft };
}
test("customer deletion hides children, preserves historical links and rejects new use", async () => {
  const { c, p, input, draft } = await fixture();
  const project = await create("projects", {
    name: "기존 프로젝트",
    customerId: c.id,
    productId: p.id,
    status: "producing",
  });
  const removed = await remove("customer-delete", c);
  assert.ok(removed.deletedAt);
  assert.equal(removed.deletedBy, actor);
  assert.ok((await get(p.id))?.deletedAt);
  assert.equal((await get(project.id))?.productId, p.id);
  assert.equal((await get(draft.id))?.customerName, c.name);
  await assert.rejects(
    save("products", { name: "새 제품", customerId: c.id }, actor),
    /삭제/,
  );
  await assert.rejects(saveQuote(input, actor), /삭제/);
  await assert.rejects(confirmQuote(draft.id, draft.version, actor), /삭제/);
  await assert.rejects(
    save("customers", { name: "삭제 후 수정" }, actor, c.id, removed.version),
    /삭제/,
  );
});
test("individual product deletion leaves customer and sibling usable; versions and kinds are checked", async () => {
  const { c, p, input } = await fixture();
  const sibling = await save(
    "products",
    { name: "남길 제품", customerId: c.id },
    actor,
  );
  await assert.rejects(remove("customer-delete", p), /찾을/);
  await assert.rejects(
    remove("product-delete", { ...p, version: p.version + 1 }),
    /다른 곳/,
  );
  assert.ok(!(await get(p.id))?.deletedAt);
  await remove("product-delete", p);
  assert.ok(!(await get(c.id))?.deletedAt);
  assert.ok(!(await get(sibling.id))?.deletedAt);
  await assert.rejects(saveQuote(input, actor), /삭제/);
  assert.ok((await saveQuote({ ...input, productId: sibling.id }, actor)).id);
  assert.ok((await saveQuote({ ...input, productId: null }, actor)).id);
  const deleted = await get(p.id);
  await assert.rejects(remove("product-delete", deleted!), /이미 삭제/);
});

test("customer restoration restores its cascade only, not independently deleted products", async () => {
  const { c, p, input } = await fixture();
  const separate = await save(
    "products",
    { name: "개별 삭제 제품", customerId: c.id },
    actor,
  );
  const separateDeleted = await remove("product-delete", separate);
  const deleted = await remove("customer-delete", c);
  await assert.rejects(
    command(
      "product-restore",
      { id: separateDeleted.id, version: separateDeleted.version },
      actor,
      randomUUID(),
    ),
    /삭제/,
  );
  const restored = await command(
    "customer-restore",
    { id: c.id, version: deleted.version },
    actor,
    randomUUID(),
  );
  assert.equal(restored.deletedAt, null);
  assert.ok(restored.restoredAt);
  assert.equal((await get(p.id))?.deletedAt, null);
  assert.ok((await get(separate.id))?.deletedAt);
  assert.ok((await saveQuote(input, actor)).id);
  await assert.rejects(
    command(
      "product-restore",
      { id: separateDeleted.id, version: separateDeleted.version + 1 },
      actor,
      randomUUID(),
    ),
    /다른 곳/,
  );
  const productRestored = await command(
    "product-restore",
    { id: separateDeleted.id, version: separateDeleted.version },
    actor,
    randomUUID(),
  );
  assert.equal(productRestored.deletedAt, null);
  await assert.rejects(
    command(
      "product-restore",
      { id: p.id, version: (await get(p.id))!.version },
      actor,
      randomUUID(),
    ),
    /삭제된 항목/,
  );
});
test("customers deleted before restore feature recover matching historical cascade", async () => {
  const { c, p } = await fixture();
  const { update } = await import("../src/lib/db");
  const patch = { deletedAt: new Date().toISOString(), deletedBy: actor };
  const deleted = await update(c.id, patch);
  await update(p.id, patch);
  await command(
    "customer-restore",
    { id: c.id, version: deleted.version },
    actor,
    randomUUID(),
  );
  assert.equal((await get(p.id))?.deletedAt, null);
});
