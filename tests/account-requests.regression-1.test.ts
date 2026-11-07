// Regression: ISSUE-003 — private account requests need ownership and conflict checks.
// Found by /qa on 2026-11-08
// Report: docs/service-lifecycle-qa-2026-11-08.md
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import {
  accountRequests,
  requestAccountHelp,
  changeAccountRequest,
} from "../src/lib/account-requests";

test("account requests isolate roles and owners, deduplicate concurrent submissions and preserve the original", async () => {
  const owner = { role: "advertiser" as const, id: crypto.randomUUID() };
  const input = {
    category: "withdrawal",
    message: "잔여 정산 확인 후 탈퇴를 요청합니다.",
    consent: true,
  };
  const result = await Promise.all([
    requestAccountHelp(owner, input),
    requestAccountHelp(owner, {
      ...input,
      message: "중복 전송 내용은 덮어쓰지 않습니다.",
    }),
  ]);
  assert.equal(result[0].request.id, result[1].request.id);
  assert.equal(result.filter((r) => r.existing).length, 1);
  assert.equal((await accountRequests(owner)).length, 1);
  assert.equal(
    (await accountRequests({ role: "participant", id: owner.id })).length,
    0,
  );
  assert.equal(
    (await accountRequests({ ...owner, id: crypto.randomUUID() })).length,
    0,
  );
  assert.equal(
    (await accountRequests(owner))[0].message,
    result[0].request.message,
  );
  await assert.rejects(() =>
    requestAccountHelp(owner, { ...input, consent: false }),
  );
  await assert.rejects(() =>
    requestAccountHelp(owner, { ...input, ownerId: crypto.randomUUID() }),
  );
});

test("only owners cancel, only admins answer, stale writes and terminal state changes fail", async () => {
  const owner = { role: "participant" as const, id: crypto.randomUUID() };
  const other = { ...owner, id: crypto.randomUUID() };
  const admin = { role: "admin" as const, id: "qa-admin@test.local" };
  const { request } = await requestAccountHelp(owner, {
    category: "privacy",
    message: "개인정보 삭제 절차를 확인하고 싶습니다.",
    consent: true,
  });
  const update = {
    id: request.id,
    version: 1,
    status: "answered",
    response: "남은 정산 내역을 먼저 확인합니다.",
  };
  await assert.rejects(() => changeAccountRequest(owner, update), /철회만/);
  await assert.rejects(
    () =>
      changeAccountRequest(other, {
        ...update,
        status: "cancelled",
        response: undefined,
      }),
    /찾을 수/,
  );
  await assert.rejects(
    () => changeAccountRequest(admin, { ...update, response: undefined }),
    /처리 내용/,
  );
  const reviewing = await changeAccountRequest(admin, {
    id: request.id,
    version: 1,
    status: "reviewing",
  });
  await assert.rejects(
    () =>
      changeAccountRequest(owner, {
        id: request.id,
        version: 1,
        status: "cancelled",
      }),
    /변경/,
  );
  const answered = await changeAccountRequest(admin, {
    ...update,
    version: reviewing.version,
  });
  assert.equal(answered.status, "answered");
  assert.equal((await accountRequests(owner))[0].response, update.response);
  await assert.rejects(
    () =>
      changeAccountRequest(owner, {
        id: request.id,
        version: answered.version,
        status: "cancelled",
      }),
    /종료/,
  );
  const next = await requestAccountHelp(owner, {
    category: "privacy",
    message: "추가 개인정보 삭제 요청입니다.",
    consent: true,
  });
  assert.equal(next.existing, false);
  assert.equal(
    (
      await changeAccountRequest(owner, {
        id: next.request.id,
        version: 1,
        status: "cancelled",
      })
    ).status,
    "cancelled",
  );
});
