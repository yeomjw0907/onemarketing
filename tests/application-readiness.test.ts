import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationReadiness } from "../src/lib/application-readiness";
import type { ApplicationDraft } from "../src/lib/participant-application-schema";
const fresh = (): ApplicationDraft => ({
  name: "",
  nickname: "",
  phone: "",
  email: "",
  region: "",
  specialties: "",
  introduction: "",
  payment: { method: "kakaopay" },
  accounts: [{ id: crypto.randomUUID(), channel: "blog", url: "", label: "" }],
});
test("빠진 필수 항목을 표시하고 입력·동의 완료 시 안내와 활성화를 함께 갱신한다", () => {
  const draft = fresh();
  const empty = applicationReadiness(draft, false);
  assert.equal(empty.ready, false);
  for (const label of ["이름", "휴대전화", "블로그 주소", "개인정보 동의"])
    assert.ok(empty.message.includes(label));
  Object.assign(draft, { name: "신청자", phone: "010-1234-5678" });
  draft.accounts[0].url = "https://blog.naver.com/onecation";
  assert.equal(
    applicationReadiness(draft, false).message,
    "입력 필요: 개인정보 동의",
  );
  assert.equal(applicationReadiness(draft, true).ready, true);
  draft.payment = { method: "bank", bankName: "", accountNumber: "" };
  const bank = applicationReadiness(draft, true);
  assert.equal(bank.ready, false);
  assert.ok(bank.message.includes("은행"));
  assert.ok(bank.message.includes("계좌번호"));
  draft.payment = {
    method: "bank",
    bankName: "국민은행",
    accountNumber: "1234567890",
  };
  assert.equal(applicationReadiness(draft, true).ready, true);
  draft.email = "not-an-email";
  assert.equal(applicationReadiness(draft, true).message, "확인 필요: 이메일");
});
