import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { advertiserAuth } from "../src/lib/market";
import {
  readAccountState,
  saveBuilder,
  changeFavorites,
  checkoutBuilder,
  StateConflict,
} from "../src/lib/account-state";
import {
  checkout,
  confirmPayment,
  savePaymentSettings,
} from "../src/lib/commerce";
import { campaignQuote, policyVersion } from "../src/lib/commerce-policy";
import { query } from "../src/lib/db";
const admin = { role: "admin" as const, id: "workspace-admin@test.local" };
async function owner() {
  const a = await advertiserAuth(
    {
      action: "register",
      email: crypto.randomUUID() + "@test.local",
      password: "strong-password-123",
      name: "계정 저장",
      phone: "01012345678",
      consent: true,
    },
    crypto.randomUUID(),
  );
  return { role: "advertiser" as const, id: a.account.id };
}
const campaign = {
  title: "계정 캠페인",
  brand: "저장 검증",
  product: "제품",
  guide: "제공 자료와 캠페인 약정을 확인해주세요.",
  kind: "self_cash" as const,
  channel: "blog" as const,
  quantity: 5,
  reward: 20000,
  benefit: "",
  managed: false,
  deadline: "2027-11-01",
  submissionDeadline: "2027-11-15",
};
const state = () => ({
  draft: { ...campaign, title: "가", imageUrl: "h" },
  cart: [campaign],
  step: 2,
  editing: 0,
});
test("builder state follows account identity, preserves incomplete drafts and rejects a stale device", async () => {
  const a = await owner(),
    b = await owner();
  const initial = await readAccountState(a, "builder");
  assert.equal(initial.version, 0);
  const saved = await saveBuilder(a, { version: 0, state: state() });
  assert.equal(saved.version, 1);
  assert.equal(saved.state.draft.imageUrl, "h");
  assert.equal((await readAccountState(a, "builder")).state.draft.title, "가");
  assert.equal((await readAccountState(b, "builder")).state.cart.length, 0);
  await assert.rejects(
    () => saveBuilder(a, { version: 0, state: state() }),
    StateConflict,
  );
  const edits = await Promise.allSettled([
    saveBuilder(a, { version: 1, state: { ...state(), step: 1 } }),
    saveBuilder(a, { version: 1, state: { ...state(), step: 3 } }),
  ]);
  assert.equal(edits.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await readAccountState(a, "builder")).version, 2);
  await assert.rejects(
    () =>
      saveBuilder(
        { role: "participant", id: a.id },
        { version: 0, state: state() },
      ),
    /광고주/,
  );
  await assert.rejects(() =>
    saveBuilder(b, { version: 0, state: { ...state(), editing: 4 } }),
  );
});
test("account checkout atomically clears a shared cart, rejects a second device and retries idempotently", async () => {
  const a = await owner();
  await savePaymentSettings(admin, {
    enabled: true,
    bank: "테스트 은행",
    account: "123-4567",
    holder: "테스트",
  });
  const saved = await saveBuilder(a, { version: 0, state: state() });
  const input = {
    id: crypto.randomUUID(),
    version: saved.version,
    expectedTotal: 110000,
    consent: true,
  };
  const results = await Promise.allSettled([
    checkoutBuilder(a, input),
    checkoutBuilder(a, { ...input, id: crypto.randomUUID() }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const success = results.find(
    (x) => x.status === "fulfilled",
  ) as PromiseFulfilledResult<any>;
  assert.equal((await readAccountState(a, "builder")).state.cart.length, 0);
  const winning = { ...input, id: success.value.order.id };
  assert.equal(
    (await checkoutBuilder(a, winning)).order.id,
    success.value.order.id,
  );
  assert.equal(
    (
      await query<{ count: number }>(
        "select count(*)::int count from commerce_orders where advertiser_id=$1",
        [a.id],
      )
    )[0].count,
    1,
  );
  await assert.rejects(
    () => checkoutBuilder(a, { ...input, id: crypto.randomUUID() }),
    StateConflict,
  );
});
test("favorite mutations merge independently, separate roles and reject unpublished additions", async () => {
  const a = await owner(),
    b = await owner();
  await savePaymentSettings(admin, {
    enabled: true,
    bank: "테스트 은행",
    account: "123-4567",
    holder: "테스트",
  });
  const c = { ...campaign, title: "관심 캠페인" },
    order = await checkout(a.id, {
      id: crypto.randomUUID(),
      campaigns: [c],
      expectedTotal: campaignQuote(c).total,
      policyVersion,
      consent: true,
    });
  const [row] = await query<{ id: string }>(
    "select id from commerce_campaigns where order_id=$1",
    [order.id],
  );
  await assert.rejects(
    () => changeFavorites(a, { action: "favorite", id: row.id, saved: true }),
    /공개/,
  );
  await confirmPayment(admin, order.id, order.version, "favorite test payment");
  await changeFavorites(a, { action: "favorite", id: row.id, saved: true });
  assert.deepEqual((await readAccountState(a, "favorites")).state.ids, [
    row.id,
  ]);
  assert.deepEqual((await readAccountState(b, "favorites")).state.ids, []);
  assert.deepEqual(
    (await readAccountState({ role: "participant", id: a.id }, "favorites"))
      .state.ids,
    [],
  );
  await changeFavorites(a, { action: "favorite", id: row.id, saved: false });
  assert.deepEqual((await readAccountState(a, "favorites")).state.ids, []);
  await changeFavorites(a, {
    action: "import-favorites",
    ids: [row.id, row.id, crypto.randomUUID()],
  });
  assert.deepEqual((await readAccountState(a, "favorites")).state.ids, [
    row.id,
  ]);
  assert.equal((await readAccountState(a, "builder")).version, 0);
});
