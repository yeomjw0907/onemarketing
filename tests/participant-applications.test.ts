import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import {
  submitApplication,
  reviewApplication,
  listApplications,
} from "../src/lib/participant-applications";
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
  await assert.rejects(
    reviewApplication(
      { id: result.id, version: 2, action: "approve", data: input.data },
      actor,
    ),
    /이미 처리/,
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
    await submitApplication({ ...input, key: crypto.randomUUID() });
  await assert.rejects(
    submitApplication({ ...input, key: crypto.randomUUID() }),
    /오늘 신청/,
  );
});
