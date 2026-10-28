import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { advertiserAuth } from "../src/lib/market";
import { create, get, list, query, execute } from "../src/lib/db";
import {
  advertiserProducts,
  saveAdvertiserProduct,
  addAdvertiserProductFile,
  advertiserProductFile,
} from "../src/lib/advertiser-products";
import { productBasis } from "../src/lib/product-understanding";
import {
  issueIntake,
  intakeView,
  saveIntake,
  reviewIntake,
  adminIntakes,
} from "../src/lib/intake";
import { intakeQuestions } from "../src/lib/intake-question-plan";
async function account() {
  return (
    await advertiserAuth(
      {
        action: "register",
        email: randomUUID() + "@test.local",
        password: "test-password-123",
        name: "고객",
        phone: "01012345678",
        consent: true,
        companyName: "테스트 업체",
        brand: "테스트",
        industry: "생활용품",
        businessType: "preparing",
        businessNumber: "",
        address: "서울",
        description: "확인된 테스트 제품",
      },
      randomUUID(),
    )
  ).account;
}
test("제품 소유권·수정 충돌·관리자 공유와 진행 중 캠페인 기준 보존", async () => {
  const a = await account(),
    b = await account();
  const p = await saveAdvertiserProduct(a.id, {
    name: "기존 제품",
    facts: "확정된 제품 설명",
    links: ["https://example.com"],
  });
  assert.equal((await get(String(p.id)))?.customerId, a.customer_id);
  const project = await create("projects", {
    customerId: a.customer_id,
    productId: p.id,
    status: "materials",
  });
  const basis = await productBasis(project);
  const saved = await saveAdvertiserProduct(a.id, {
    ...p,
    name: "새 제품명",
    facts: "수정한 제품 설명",
    customerId: b.customer_id,
  });
  assert.equal((await get(String(p.id)))?.customerId, a.customer_id);
  assert.equal((await advertiserProducts(a.id))[0].name, "새 제품명");
  assert.equal((await advertiserProducts(b.id)).length, 0);
  const updatedProject = (await get(project.id))!;
  assert.equal((await productBasis(updatedProject)).hash, basis.hash);
  assert.equal(
    (updatedProject.productLibrarySnapshot as any).name,
    "기존 제품",
  );
  await assert.rejects(
    saveAdvertiserProduct(a.id, { ...p, name: "오래된 수정" }),
    /변경/,
  );
  await assert.rejects(
    saveAdvertiserProduct(b.id, { ...saved, name: "다른 고객" }),
    /찾을/,
  );
  await assert.rejects(
    saveAdvertiserProduct(a.id, {
      name: "잘못된 링크",
      links: ["javascript:alert(1)"],
    }),
  );
  const file = await addAdvertiserProductFile(
    a.id,
    String(p.id),
    "제품소개.txt",
    Buffer.from("확인된 제품 정보"),
  );
  assert.equal((await get(file.id))?.productId, p.id);
  assert.equal(
    (await advertiserProductFile(a.id, file.id)).buffer.toString(),
    "확인된 제품 정보",
  );
  await assert.rejects(advertiserProductFile(b.id, file.id), /찾을/);
  await assert.rejects(
    addAdvertiserProductFile(
      b.id,
      String(p.id),
      "bad.txt",
      Buffer.from("금지"),
    ),
    /찾을/,
  );
  const publicView = await advertiserProducts(a.id);
  assert.equal(publicView[0].files.length, 1);
  assert.ok(!JSON.stringify(publicView).includes("storageName"));
});
test("링크는 요청한 질문만 저장하고 임시 저장·보완·제출본·승인·회수를 연결", async () => {
  const a = await account();
  const p = await saveAdvertiserProduct(a.id, {
    name: "링크 제품",
    facts: "원본 기준",
  });
  const project = await create("projects", {
    customerId: a.customer_id,
    productId: p.id,
    status: "materials",
  });
  const issued = await issueIntake(
    project.id,
    ["product", "campaign"],
    "이번 캠페인 안내",
    "admin@test.local",
  );
  const token = issued.url.split("#")[1];
  let view: Awaited<ReturnType<typeof saveIntake>> = await intakeView(token);
  assert.equal(view.fields.productName, "링크 제품");
  assert.equal(view.fields.contactName, "고객");
  assert.equal(view.fields.contactPhone, "01012345678");
  const { update } = await import("../src/lib/db");
  await update(a.customer_id!, { contactName: "", phone: "" });
  const legacy = await issueIntake(
    project.id,
    ["company"],
    "이전 고객 기본값",
    "admin@test.local",
  );
  const legacyView = await intakeView(legacy.url.split("#")[1]);
  assert.equal(legacyView.fields.contactName, "고객");
  assert.equal(legacyView.fields.contactPhone, "01012345678");
  await update(a.customer_id!, {
    contactName: "별도 캠페인 담당자",
    phone: "01099998888",
  });
  const override = await issueIntake(
    project.id,
    ["company"],
    "관리자 지정 기본값",
    "admin@test.local",
  );
  const overrideView = await intakeView(override.url.split("#")[1]);
  assert.equal(overrideView.fields.contactName, "별도 캠페인 담당자");
  assert.equal(overrideView.fields.contactPhone, "01099998888");
  await assert.rejects(
    saveIntake(token, view.version, view.fields, false, randomUUID()),
    /다른 캠페인/,
  );
  view = await saveIntake(
    token,
    view.version,
    {
      ...view.fields,
      productName: "입력 제품",
      companyName: "권한 밖 변경",
      features: "고객 제공 설명",
      fulfillment: "visit",
      visitAddress: "서울",
      startDate: "2026-11-10",
    },
    false,
  );
  assert.notEqual(view.fields.companyName, "권한 밖 변경");
  assert.equal((await intakeView(token)).fields.visitAddress, "서울");
  await assert.rejects(saveIntake(token, 1, view.fields, true), /변경/);
  view = await saveIntake(token, view.version, view.fields, true);
  await assert.rejects(
    saveIntake(token, view.version, view.fields, false),
    /수정/,
  );
  await reviewIntake(
    view.id,
    view.version,
    "changes",
    "방문 시간을 알려주세요.",
    "admin@test.local",
  );
  view = await intakeView(token);
  assert.equal(view.status, "changes");
  view = await saveIntake(
    token,
    view.version,
    { ...view.fields, visitTimes: "평일 10시 예약" },
    true,
  );
  await reviewIntake(view.id, view.version, "accept", "", "admin@test.local");
  assert.equal((await intakeView(token)).status, "accepted");
  assert.ok((await get(project.id))?.intakeRevisionId);
  assert.equal((await get(String(p.id)))?.facts, "원본 기준");
  const admin = await adminIntakes(project.id);
  assert.ok(!JSON.stringify(admin).includes("tokenHash"));
  assert.equal(
    (await list("assets")).filter(
      (f) => f.projectId === project.id && f.category === "source",
    ).length,
    1,
  );
  const current = await intakeView(token);
  await reviewIntake(
    current.id,
    current.version,
    "revoke",
    "",
    "admin@test.local",
  );
  await assert.rejects(intakeView(token), /만료/);
  const fileOnly = intakeQuestions(["files"]);
  assert.deepEqual(
    fileOnly.map((q) => q.key),
    ["notes", "files"],
  );
  const steps = intakeQuestions(["campaign"]).filter(
    (q) => !q.visible || q.visible({ fulfillment: "visit" }),
  );
  assert.ok(steps.some((q) => q.key === "visitAddress"));
  assert.ok(!steps.some((q) => q.key === "shippingDate"));
});
