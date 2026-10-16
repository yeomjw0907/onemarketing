import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import {
  submitApplication,
  reviewApplication,
  listApplications,
} from "../src/lib/participant-applications";
import { bindKakao } from "../src/lib/kakao-auth";
import { get, list } from "../src/lib/db";
const actor = "application-review@local";
function application() {
  const key = crypto.randomUUID();
  return {
    key,
    consent: true,
    data: {
      name: "신청자",
      nickname: "리뷰어",
      phone: "010-1234-5678",
      email: "reviewer@example.com",
      region: "서울 마포구",
      specialties: "뷰티",
      introduction: "블로그 운영 중",
      payment: {
        method: "bank",
        bankName: "국민은행",
        accountNumber: "123456789012",
      },
      accounts: [
        {
          id: crypto.randomUUID(),
          channel: "blog",
          approvalStatus: "approved",
          url: "https://blog.naver.com/" + key,
          label: "",
        },
      ],
    },
  };
}
test("신청 수정 후 동시 승인도 참여자를 한 번만 등록한다", async () => {
  const input = application();
  const result = await submitApplication(input);
  assert.deepEqual(await submitApplication(input), result);
  assert.equal((await list("participants")).length, 0);
  const edited = { ...input.data, name: "수정한 이름", phone: "010-9999-0000" };
  await reviewApplication(
    { id: result.id, version: 1, action: "save", data: edited },
    actor,
  );
  await assert.rejects(
    reviewApplication(
      { id: result.id, version: 1, action: "approve", data: edited },
      actor,
    ),
    /다른 곳에서/,
  );
  const approvals = await Promise.all(
    [1, 2].map(() =>
      reviewApplication(
        { id: result.id, version: 2, action: "approve", data: edited },
        actor,
      ),
    ),
  );
  assert.equal(approvals[0].participantId, approvals[1].participantId);
  const p = await get(approvals[0].participantId!);
  assert.equal(p?.name, edited.name);
  assert.equal(p?.phone, edited.phone);
  assert.equal(p?.status, "active");
  assert.deepEqual(p?.payment, edited.payment);
  assert.equal((await list("participants")).length, 1);
  assert.equal(
    (await listApplications()).find((a) => a.id === result.id)?.status,
    "approved",
  );
});
test("기존 참여자 계정 중복은 승인 전체를 되돌리고 반려는 참여자를 만들지 않는다", async () => {
  const existing = (await list("participants"))[0];
  const input = application();
  input.data.phone = "010-3333-4444";
  const result = await submitApplication(input);
  const duplicate = { ...input.data, accounts: existing.accounts };
  await assert.rejects(
    reviewApplication(
      { id: result.id, version: 1, action: "approve", data: duplicate },
      actor,
    ),
    /다른 참여자/,
  );
  assert.equal(
    (await listApplications()).find((a) => a.id === result.id)?.status,
    "new",
  );
  await reviewApplication(
    { id: result.id, version: 1, action: "reject", data: input.data },
    actor,
  );
  assert.equal((await list("participants")).length, 1);
  const revised = { ...input.data, name: "반려 후 수정한 신청자" };
  await reviewApplication(
    { id: result.id, version: 2, action: "save", data: revised },
    actor,
  );
  assert.equal(
    (await listApplications()).find((a) => a.id === result.id)?.status,
    "rejected",
  );
  await assert.rejects(
    reviewApplication(
      { id: result.id, version: 2, action: "approve", data: revised },
      actor,
    ),
    /다른 곳에서/,
  );
  const approvals = await Promise.all(
    [1, 2].map(() =>
      reviewApplication(
        { id: result.id, version: 3, action: "approve", data: revised },
        actor,
      ),
    ),
  );
  assert.equal(approvals[0].participantId, approvals[1].participantId);
  assert.equal((await get(approvals[0].participantId!))?.name, revised.name);
  assert.equal((await list("participants")).length, 2);
  await assert.rejects(
    reviewApplication(
      { id: result.id, version: 4, action: "save", data: revised },
      actor,
    ),
    /이미 승인/,
  );
});
test("동의·웹 주소·중복 계정 검사와 하루 접수 제한", async () => {
  const input = application();
  input.data.phone = "010-7777-8888";
  await assert.rejects(submitApplication({ ...input, consent: false }));
  await assert.rejects(
    submitApplication({
      ...input,
      data: { ...input.data, payment: undefined },
    }),
  );
  await assert.rejects(
    submitApplication({
      ...input,
      data: {
        ...input.data,
        payment: { method: "bank", bankName: "", accountNumber: "" },
      },
    }),
  );
  await assert.rejects(submitApplication({ ...input, website: "spam" }));
  await assert.rejects(
    submitApplication({
      ...input,
      data: {
        ...input.data,
        accounts: [{ ...input.data.accounts[0], url: "javascript:alert(1)" }],
      },
    }),
  );
  await assert.rejects(
    submitApplication({
      ...input,
      data: {
        ...input.data,
        accounts: [input.data.accounts[0], input.data.accounts[0]],
      },
    }),
  );
  for (let i = 0; i < 3; i++)
    await submitApplication({
      ...input,
      key: crypto.randomUUID(),
      data: {
        ...input.data,
        accounts: [
          {
            ...input.data.accounts[0],
            url: "https://blog.naver.com/" + crypto.randomUUID(),
          },
        ],
      },
    });
  await assert.rejects(
    submitApplication({
      ...input,
      key: crypto.randomUUID(),
      data: {
        ...input.data,
        accounts: [
          {
            ...input.data.accounts[0],
            url: "https://blog.naver.com/" + crypto.randomUUID(),
          },
        ],
      },
    }),
    /오늘 신청/,
  );
});

test("인스타그램 아이디는 신청 저장·승인 단계 모두 표준 프로필 URL로 보존된다", async () => {
  const input = application();
  input.data.phone = "010-2222-3333";
  input.data.accounts[0].channel = "instagram";
  input.data.accounts[0].url = "@onecation_approval";
  const applicationRow = await submitApplication(input);
  const stored = (await listApplications()).find(
    (a) => a.id === applicationRow.id,
  )!;
  assert.equal(
    stored.data.accounts[0].url,
    "https://www.instagram.com/onecation_approval/",
  );
  const approved = await reviewApplication(
    { id: applicationRow.id, version: 1, action: "approve", data: input.data },
    actor,
  );
  const participant = await get(approved.participantId!);
  assert.equal(
    (participant?.accounts as { url: string }[])[0].url,
    stored.data.accounts[0].url,
  );
  assert.deepEqual(participant?.payment, input.data.payment);
});

test("관리 신청은 권한 동의와 별칭이 필요하고 공개 신청은 승인 상태를 지정할 수 없다", async () => {
  const input = application();
  input.data.phone = "010-8765-4321";
  const data = {
    ...input.data,
    operationType: "managed",
    teamName: "파트너",
    authorityConsent: false,
  };
  await assert.rejects(submitApplication({ ...input, data }), /권한/);
  data.authorityConsent = true;
  await assert.rejects(submitApplication({ ...input, data }), /별칭/);
  data.accounts[0].label = "크리에이터 A";
  const second = {
    ...data.accounts[0],
    id: crypto.randomUUID(),
    url: "https://blog.naver.com/" + crypto.randomUUID(),
    label: "크리에이터 B",
  };
  data.accounts.push(second);
  const result = await submitApplication({ ...input, data });
  const stored = (await listApplications()).find((a) => a.id === result.id)!;
  assert.ok(stored.data.accounts.every((a) => a.approvalStatus === "pending"));
  const approved = await reviewApplication(
    {
      id: result.id,
      version: 1,
      action: "approve",
      data: {
        ...data,
        accounts: [
          { ...data.accounts[0], approvalStatus: "approved" },
          { ...second, approvalStatus: "rejected" },
        ],
      },
    },
    actor,
  );
  const participant = (await get(approved.participantId!))!;
  assert.equal(participant.operationType, "managed");
  assert.deepEqual(
    (participant.accounts as { approvalStatus: string }[]).map(
      (a) => a.approvalStatus,
    ),
    ["approved", "rejected"],
  );
});

test("승인 참여자를 수정·삭제하면 승인 목록에서 제외하고 원본과 이력은 보존한다", async () => {
  const input = application();
  input.data.phone = "010-7654-3210";
  const submitted = await submitApplication(input);
  const approved = await reviewApplication(
    { id: submitted.id, version: 1, action: "approve", data: input.data },
    actor,
  );
  const { command, save } = await import("../src/lib/domain");
  const participant = (await get(approved.participantId!))!;
  const edited = await save(
    "participants",
    { ...participant, name: "승인 후 수정", phone: "010-2222-8888" },
    actor,
    participant.id,
    participant.version,
  );
  const history = await save(
    "participant_history",
    {
      participantId: participant.id,
      name: "기존 협업",
      channel: "blog",
      date: "2026-10-16",
      amount: 3000,
      paid: false,
    },
    actor,
  );
  await assert.rejects(
    command(
      "participant-delete",
      { id: participant.id, version: participant.version },
      actor,
      crypto.randomUUID(),
    ),
    /수정/,
  );
  assert.ok((await listApplications()).some((a) => a.id === submitted.id));
  const deleted = await command(
    "participant-delete",
    { id: participant.id, version: edited.version },
    actor,
    crypto.randomUUID(),
  );
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.status, "closed");
  assert.equal(deleted.name, "승인 후 수정");
  assert.ok(!(await listApplications()).some((a) => a.id === submitted.id));
  assert.equal((await get(history.id))!.participantId, participant.id);
  assert.equal((await get(history.id))!.paid, false);
  const updated = await save(
    "participants",
    { ...deleted, name: "이력 정보 수정", status: "active" },
    actor,
    deleted.id,
    deleted.version,
  );
  assert.equal(updated.status, "closed");
  assert.ok(updated.deletedAt);
});

test("삭제 후 복구는 이전 상태와 승인 연결·이력을 복원하고 오래된 요청을 차단한다", async () => {
  const { command, save } = await import("../src/lib/domain");
  const input = application();
  input.data.phone = "010-7654-3200";
  const submitted = await submitApplication(input);
  const approved = await reviewApplication(
    { id: submitted.id, version: 1, action: "approve", data: input.data },
    actor,
  );
  let participant = (await get(approved.participantId!))!;
  const accounts = participant.accounts;
  for (const status of ["active", "paused", "closed"]) {
    participant = await save(
      "participants",
      { ...participant, status },
      actor,
      participant.id,
      participant.version,
    );
    const deleted = await command(
      "participant-delete",
      { id: participant.id, version: participant.version },
      actor,
      crypto.randomUUID(),
    );
    assert.equal(deleted.statusBeforeDeletion, status);
    await assert.rejects(
      command(
        "participant-delete",
        { id: deleted.id, version: deleted.version },
        actor,
        crypto.randomUUID(),
      ),
      /이미 삭제/,
    );
    await assert.rejects(
      command(
        "participant-restore",
        { id: deleted.id, version: participant.version },
        actor,
        crypto.randomUUID(),
      ),
      /수정/,
    );
    assert.ok(!(await listApplications()).some((a) => a.id === submitted.id));
    participant = await command(
      "participant-restore",
      { id: deleted.id, version: deleted.version },
      actor,
      crypto.randomUUID(),
    );
    assert.equal(participant.status, status);
    assert.equal(participant.deletedAt, null);
    assert.deepEqual(participant.accounts, accounts);
    assert.ok(
      (await listApplications()).some(
        (a) => a.id === submitted.id && a.participant_id === participant.id,
      ),
    );
    await assert.rejects(
      command(
        "participant-restore",
        { id: participant.id, version: participant.version },
        actor,
        crypto.randomUUID(),
      ),
      /삭제된 참여자/,
    );
  }
  const { update } = await import("../src/lib/db");
  const legacy = await update(participant.id, {
    deletedAt: new Date().toISOString(),
    statusBeforeDeletion: null,
  });
  const restored = await command(
    "participant-restore",
    { id: legacy.id, version: legacy.version },
    actor,
    crypto.randomUUID(),
  );
  assert.equal(restored.status, "paused");
});

test("일괄 삭제·복구는 전체 성공 또는 롤백하고 중복 요청은 한 번만 처리한다", async () => {
  const { command, save } = await import("../src/lib/domain");
  const first = await save(
    "participants",
    { name: "일괄 A", status: "active", accounts: [] },
    actor,
  );
  const second = await save(
    "participants",
    { name: "일괄 B", status: "paused", accounts: [] },
    actor,
  );
  const item = (p: { id: string; version: number }) => ({
    id: p.id,
    version: p.version,
  });
  const items = [item(first), item(second)];
  await assert.rejects(
    command(
      "participant-bulk-delete",
      { items: [items[0], { ...items[1], version: 99 }] },
      actor,
      crypto.randomUUID(),
    ),
    /수정/,
  );
  assert.equal((await get(first.id))!.version, first.version);
  assert.ok(!(await get(first.id))!.deletedAt);
  await assert.rejects(
    command(
      "participant-bulk-delete",
      { items: [items[0], items[0]] },
      actor,
      crypto.randomUUID(),
    ),
    /중복/,
  );
  await assert.rejects(
    command(
      "participant-bulk-delete",
      { items: [] },
      actor,
      crypto.randomUUID(),
    ),
  );
  const key = crypto.randomUUID();
  const deleted = await command(
    "participant-bulk-delete",
    { items },
    actor,
    key,
  );
  assert.equal(deleted.processedCount, 2);
  assert.deepEqual(
    await command("participant-bulk-delete", { items }, actor, key),
    deleted,
  );
  const archived = [(await get(first.id))!, (await get(second.id))!];
  assert.ok(archived.every((p) => p.deletedAt));
  await assert.rejects(
    command(
      "participant-bulk-restore",
      { items: [item(archived[0]), { ...item(archived[1]), version: 99 }] },
      actor,
      crypto.randomUUID(),
    ),
    /수정/,
  );
  assert.ok((await get(first.id))!.deletedAt);
  assert.equal((await get(first.id))!.version, archived[0].version);
  const restored = await command(
    "participant-bulk-restore",
    { items: archived.map(item) },
    actor,
    crypto.randomUUID(),
  );
  assert.equal(restored.processedCount, 2);
  assert.equal((await get(first.id))!.status, "active");
  assert.equal((await get(second.id))!.status, "paused");
  assert.equal((await get(first.id))!.deletedAt, null);
});

test("신규 신청 일괄 승인은 계정별 반려를 보존하고 중복 요청에도 한 번만 등록한다", async () => {
  const { reviewApplicationsBulk } =
    await import("../src/lib/participant-applications");
  const first = application(),
    second = application();
  first.data.phone = "010-9876-1001";
  second.data.phone = "010-9876-1002";
  first.data.accounts.push({
    ...first.data.accounts[0],
    id: crypto.randomUUID(),
    url: "https://blog.naver.com/" + crypto.randomUUID(),
    label: "반려 계정",
    approvalStatus: "rejected",
  });
  const a = await submitApplication(first),
    b = await submitApplication(second);
  await reviewApplication(
    {
      id: a.id,
      version: 1,
      action: "save",
      data: {
        ...first.data,
        accounts: first.data.accounts.map((account, i) => ({
          ...account,
          approvalStatus: i === 1 ? "rejected" : "pending",
        })),
      },
    },
    actor,
  );
  const input = {
    action: "bulk-approve",
    key: crypto.randomUUID(),
    items: [
      { id: a.id, version: 2 },
      { id: b.id, version: 1 },
    ],
  };
  const result = await reviewApplicationsBulk(input, actor);
  assert.equal(result.processedCount, 2);
  assert.equal(result.participantIds.length, 2);
  assert.deepEqual(await reviewApplicationsBulk(input, actor), result);
  const participant = (await get(result.participantIds[0]))!;
  assert.deepEqual(
    (participant.accounts as { approvalStatus: string }[]).map(
      (a) => a.approvalStatus,
    ),
    ["approved", "rejected"],
  );
  await assert.rejects(
    reviewApplicationsBulk({ ...input, key: crypto.randomUUID() }, actor),
    /변경/,
  );
});

test("일괄 승인 오류는 등록 전체를 되돌리고 일괄 반려는 참여자를 생성하지 않는다", async () => {
  const { reviewApplicationsBulk } =
    await import("../src/lib/participant-applications");
  const first = application(),
    second = application();
  first.data.phone = "010-9876-2001";
  second.data.phone = "010-9876-2002";
  const a = await submitApplication(first),
    b = await submitApplication(second);
  const originalCount = (await list("participants")).length;
  const items = [
    { id: a.id, version: 1 },
    { id: b.id, version: 1 },
  ];
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-approve",
        key: crypto.randomUUID(),
        items: [items[0], { ...items[1], version: 99 }],
      },
      actor,
    ),
    /변경/,
  );
  assert.equal((await list("participants")).length, originalCount);
  assert.equal(
    (await listApplications()).find((i) => i.id === a.id)!.version,
    1,
  );
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-approve",
        key: crypto.randomUUID(),
        items: [items[0], items[0]],
      },
      actor,
    ),
    /중복/,
  );
  await reviewApplication(
    {
      id: b.id,
      version: 1,
      action: "save",
      data: {
        ...second.data,
        accounts: [
          { ...second.data.accounts[0], url: first.data.accounts[0].url },
        ],
      },
    },
    actor,
  );
  items[1].version = 2;
  await assert.rejects(
    reviewApplicationsBulk(
      { action: "bulk-approve", key: crypto.randomUUID(), items },
      actor,
    ),
    /다른 참여자/,
  );
  assert.equal((await list("participants")).length, originalCount);
  assert.equal(
    (await listApplications()).find((i) => i.id === a.id)!.status,
    "new",
  );
  const rejected = await reviewApplicationsBulk(
    { action: "bulk-reject", key: crypto.randomUUID(), items },
    actor,
  );
  assert.equal(rejected.processedCount, 2);
  assert.equal(rejected.participantIds.length, 0);
  assert.equal((await list("participants")).length, originalCount);
  assert.ok(
    (await listApplications())
      .filter((i) => [a.id, b.id].includes(i.id))
      .every((i) => i.status === "rejected"),
  );
});

test("반려 신청 일괄 재승인은 반려 계정을 보존하고 상태 충돌 시 전체를 되돌린다", async () => {
  const { reviewApplicationsBulk } =
    await import("../src/lib/participant-applications");
  const first = application(),
    second = application();
  first.data.phone = "010-9876-3001";
  second.data.phone = "010-9876-3002";
  first.data.accounts.push({
    ...first.data.accounts[0],
    id: crypto.randomUUID(),
    url: "https://blog.naver.com/" + crypto.randomUUID(),
    label: "개별 반려",
    approvalStatus: "rejected",
  });
  const a = await submitApplication(first),
    b = await submitApplication(second);
  await reviewApplication(
    { id: a.id, version: 1, action: "reject", data: first.data },
    actor,
  );
  const count = (await list("participants")).length;
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-reapprove",
        key: crypto.randomUUID(),
        items: [
          { id: a.id, version: 2 },
          { id: b.id, version: 1 },
        ],
      },
      actor,
    ),
    /변경/,
  );
  assert.equal((await list("participants")).length, count);
  assert.equal(
    (await listApplications()).find((i) => i.id === a.id)!.status,
    "rejected",
  );
  await reviewApplication(
    { id: b.id, version: 1, action: "reject", data: second.data },
    actor,
  );
  const input = {
    action: "bulk-reapprove",
    key: crypto.randomUUID(),
    items: [
      { id: a.id, version: 2 },
      { id: b.id, version: 2 },
    ],
  };
  await assert.rejects(
    reviewApplicationsBulk(
      {
        ...input,
        key: crypto.randomUUID(),
        items: [
          { id: a.id, version: 2 },
          { id: b.id, version: 1 },
        ],
      },
      actor,
    ),
    /변경/,
  );
  assert.equal((await list("participants")).length, count);
  const result = await reviewApplicationsBulk(input, actor);
  assert.equal(result.processedCount, 2);
  assert.equal((await list("participants")).length, count + 2);
  assert.deepEqual(await reviewApplicationsBulk(input, actor), result);
  assert.deepEqual(
    (
      (await get(result.participantIds[0]))!.accounts as {
        approvalStatus: string;
      }[]
    ).map((a) => a.approvalStatus),
    ["approved", "rejected"],
  );
  assert.ok(
    (await listApplications())
      .filter((i) => [a.id, b.id].includes(i.id))
      .every((i) => i.status === "approved"),
  );
});

test("신규·반려 신청 일괄 삭제는 원본을 보존하고 복구 시 이전 상태로 돌아온다", async () => {
  const { reviewApplicationsBulk } =
    await import("../src/lib/participant-applications");
  const first = application(),
    second = application();
  first.data.phone = "010-9876-4001";
  second.data.phone = "010-9876-4002";
  const a = await submitApplication(first),
    b = await submitApplication(second);
  await reviewApplication(
    { id: b.id, version: 1, action: "reject", data: second.data },
    actor,
  );
  const items = [
    { id: a.id, version: 1 },
    { id: b.id, version: 2 },
  ];
  const count = (await list("participants")).length;
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-delete",
        key: crypto.randomUUID(),
        items: [items[0], { ...items[1], version: 99 }],
      },
      actor,
    ),
    /변경/,
  );
  assert.ok(
    !(await listApplications()).find((i) => i.id === a.id)!.data.deletedAt,
  );
  const input = { action: "bulk-delete", key: crypto.randomUUID(), items };
  const result = await reviewApplicationsBulk(input, actor);
  assert.equal(result.processedCount, 2);
  assert.deepEqual(await reviewApplicationsBulk(input, actor), result);
  const deleted = (await listApplications()).filter((i) =>
    [a.id, b.id].includes(i.id),
  );
  assert.ok(deleted.every((i) => i.data.deletedAt));
  assert.deepEqual(
    deleted.find((i) => i.id === a.id)!.data.accounts[0].url,
    first.data.accounts[0].url,
  );
  await assert.rejects(
    reviewApplication(
      { id: a.id, version: 2, action: "approve", data: first.data },
      actor,
    ),
    /복구/,
  );
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-approve",
        key: crypto.randomUUID(),
        items: [{ id: a.id, version: 2 }],
      },
      actor,
    ),
    /복구/,
  );
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-restore",
        key: crypto.randomUUID(),
        items: [
          { id: a.id, version: 2 },
          { id: b.id, version: 99 },
        ],
      },
      actor,
    ),
    /변경/,
  );
  assert.ok(
    (await listApplications()).find((i) => i.id === a.id)!.data.deletedAt,
  );
  const restoreInput = {
    action: "bulk-restore",
    key: crypto.randomUUID(),
    items: deleted.map((i) => ({ id: i.id, version: i.version })),
  };
  const restored = await reviewApplicationsBulk(restoreInput, actor);
  assert.equal(restored.processedCount, 2);
  assert.deepEqual(await reviewApplicationsBulk(restoreInput, actor), restored);
  const rows = (await listApplications()).filter((i) =>
    [a.id, b.id].includes(i.id),
  );
  assert.ok(rows.every((i) => !i.data.deletedAt));
  assert.equal(rows.find((i) => i.id === a.id)!.status, "new");
  assert.equal(rows.find((i) => i.id === b.id)!.status, "rejected");
  assert.equal((await list("participants")).length, count);
  const approved = (await listApplications()).find(
    (i) => i.status === "approved",
  )!;
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-delete",
        key: crypto.randomUUID(),
        items: [{ id: approved.id, version: approved.version }],
      },
      actor,
    ),
    /변경/,
  );
});

test("삭제된 신규 신청은 재접수를 막지 않으며 중복된 신청이 있으면 복구하지 않는다", async () => {
  const { reviewApplicationsBulk } =
    await import("../src/lib/participant-applications");
  const first = application();
  first.data.phone = "010-9876-5001";
  const a = await submitApplication(first);
  await reviewApplicationsBulk(
    {
      action: "bulk-delete",
      key: crypto.randomUUID(),
      items: [{ id: a.id, version: 1 }],
    },
    actor,
  );
  const replacement = await submitApplication({
    ...first,
    key: crypto.randomUUID(),
    data: { ...first.data, phone: "010-9876-5002" },
  });
  await assert.rejects(
    reviewApplicationsBulk(
      {
        action: "bulk-restore",
        key: crypto.randomUUID(),
        items: [{ id: a.id, version: 2 }],
      },
      actor,
    ),
    /중복/,
  );
  assert.ok(
    (await listApplications()).find((i) => i.id === a.id)!.data.deletedAt,
  );
  await reviewApplicationsBulk(
    {
      action: "bulk-delete",
      key: crypto.randomUUID(),
      items: [{ id: replacement.id, version: 1 }],
    },
    actor,
  );
  await reviewApplicationsBulk(
    {
      action: "bulk-restore",
      key: crypto.randomUUID(),
      items: [{ id: a.id, version: 2 }],
    },
    actor,
  );
  assert.ok(
    !(await listApplications()).find((i) => i.id === a.id)!.data.deletedAt,
  );
});

test("trusted Kakao signup survives review edits and binds only on approval", async () => {
  const input = application();
  input.data.phone = "01055557777";
  const result = await submitApplication(input, "900001");
  const app = (await listApplications()).find((a) => a.id === result.id)!;
  await reviewApplication(
    { id: result.id, version: app.version, action: "save", data: input.data },
    actor,
  );
  const edited = (await listApplications()).find((a) => a.id === result.id)!;
  const approved = await reviewApplication(
    {
      id: result.id,
      version: edited.version,
      action: "approve",
      data: input.data,
    },
    actor,
  );
  assert.ok(
    (await list("portal_links")).some(
      (l) =>
        l.purpose === "kakao-account" &&
        l.kakaoId === "900001" &&
        l.participantId === approved.participantId,
    ),
  );
  const next = application();
  next.data.phone = "01055558888";
  await assert.rejects(submitApplication(next, "900001"), /이미 연결/);
});
test("client-provided Kakao ID is discarded", async () => {
  const input = application();
  input.data.phone = "01055559999";
  const result = await submitApplication({
    ...input,
    data: { ...input.data, trustedKakaoId: "forged" },
  });
  const app = (await listApplications()).find((a) => a.id === result.id)!;
  assert.equal((app.data as any).trustedKakaoId, undefined);
});
