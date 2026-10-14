import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import "./helpers";
const { create, get, list, update } = await import("../src/lib/db");
const { issueReportLink, revokeReportLink, customerReport, reportWorkbook } =
  await import("../src/lib/customer-reports");
test("고객 보고는 고객 범위와 공개 필드만 반환하고 링크 만료·폐기·위험 URL을 차단", async () => {
  const customer = await create("customers", {
    name: "보고 고객",
    contact: "PRIVATE_CONTACT",
    businessNumber: "PRIVATE_BUSINESS",
    notes: "PRIVATE_NOTES",
  });
  const other = await create("customers", { name: "OTHER_CUSTOMER" });
  const p = await create("projects", {
    customerId: customer.id,
    name: "캠페인",
    status: "publishing",
    due: "2026-10-30",
    sale: 12345678,
    budget: 99999,
    materialNotes: "PRIVATE_MATERIAL",
  });
  const otherP = await create("projects", {
    customerId: other.id,
    name: "OTHER_PROJECT",
  });
  await create("tasks", {
    projectId: otherP.id,
    name: "OTHER_TASK",
    status: "verified",
    channel: "blog",
    link: "https://example.com/other",
  });
  await create("tasks", {
    projectId: p.id,
    name: "콘텐츠",
    order: 1,
    status: "verified",
    channel: "blog",
    participantId: "PRIVATE_PERSON",
    assignee: "PRIVATE_NAME",
    payout: 10000,
    brief: "PRIVATE_BRIEF",
    link: "https://example.com/blog",
    verifiedAt: "2026-10-14T01:00:00Z",
  });
  await create("tasks", {
    projectId: p.id,
    name: "클립",
    order: 2,
    status: "submitted",
    channel: "clip",
    participantId: "PRIVATE_PERSON",
    link: "javascript:alert(1)",
  });
  const link = await issueReportLink(customer.id, 90, "admin@test.local");
  assert.equal((await get(link.linkId))!.token, undefined);
  assert.ok(!JSON.stringify(await list("events")).includes(link.token));
  const report = (await customerReport(link.token))!;
  assert.equal(report.projects.length, 1);
  assert.equal(report.projects[0].tasks[0].participant, "참여자 1");
  assert.equal(report.projects[0].tasks[1].participant, "참여자 1");
  assert.equal(report.projects[0].tasks[1].link, "");
  assert.ok(
    !/PRIVATE_|OTHER_|payout|sale|budget|tokenHash/.test(
      JSON.stringify(report),
    ),
  );
  await assert.rejects(
    revokeReportLink(other.id, link.linkId, "admin@test.local"),
    /고객의/,
  );
  assert.equal(await customerReport("invalid"), null);
  assert.equal(await customerReport("a".repeat(64)), null);
  await update(link.linkId, { expiresAt: "2020-01-01T00:00:00Z" });
  assert.equal(await customerReport(link.token), null);
  const fresh = await issueReportLink(customer.id, 30, "admin@test.local");
  await revokeReportLink(customer.id, fresh.linkId, "admin@test.local");
  assert.equal(await customerReport(fresh.token), null);
});
test("보고 엑셀은 요약·채널별 게시 링크·확인일을 포함하고 임의 수식은 실행하지 않음", async () => {
  const customer = await create("customers", { name: "완료 고객" });
  const p = await create("projects", {
    customerId: customer.id,
    name: "완료 캠페인",
    status: "completed",
    due: "2026-10-14",
  });
  await create("tasks", {
    projectId: p.id,
    name: '=HYPERLINK("https://example.com")',
    channel: "blog",
    order: 1,
    status: "verified",
    link: "https://example.com/verified",
    verifiedAt: "2026-10-14T01:00:00Z",
  });
  const link = await issueReportLink(customer.id, 90, "admin@test.local");
  const report = (await customerReport(link.token))!;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await reportWorkbook(report)) as unknown as ExcelJS.Buffer,
  );
  assert.deepEqual(
    book.worksheets.map((s) => s.name),
    ["1_보고요약", "2_블로그게시", "3_클립게시"],
  );
  assert.equal(book.worksheets[0].getCell("D6").value, "1 / 1");
  assert.equal(
    book.worksheets[1].getCell("D2").hyperlink,
    "https://example.com/verified",
  );
  assert.equal(typeof book.worksheets[1].getCell("C2").value, "string");
  assert.match(String(book.worksheets[1].getCell("E2").value), /2026/);
  assert.equal(book.worksheets[1].getCell("F2").value, "게시 확인 완료");
});
