import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import "./helpers";
import { save } from "../src/lib/domain";
import { create, list } from "../src/lib/db";
import { bytes } from "../src/lib/assets";
import { saveCustomerFile, copyCustomerFile } from "../src/lib/customer-files";
import { customerIntakeTemplate } from "../src/lib/intake-template";
const actor = "customer-files@test.local";

test("고객 사업자번호를 저장하고 잘못된 번호는 거절", async () => {
  const customer = await save(
    "customers",
    { name: "자료 고객", businessNumber: "000-00-00000" },
    actor,
  );
  assert.equal(customer.businessNumber, "0000000000");
  assert.throws(
    () => save("customers", { name: "오류", businessNumber: "1234" }, actor),
    /사업자번호/,
  );
});

test("고객 작성 Excel의 5개 시트를 읽고 작성본·사업자등록증을 비공개 보관", async () => {
  const buffer = await customerIntakeTemplate();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  assert.equal(book.worksheets.length, 5);
  assert.equal(book.getWorksheet("4_제작요청")!.rowCount, 6);
  book.getWorksheet("2_고객브랜드")!.getCell("B2").value = "고객 작성 상호";
  const filled = Buffer.from(await book.xlsx.writeBuffer());
  const customer = await save("customers", { name: "업로드 고객" }, actor);
  const intake = await saveCustomerFile(
    {
      customerId: customer.id,
      category: "intake",
      name: "고객작성.xlsx",
      buffer: filled,
    },
    actor,
  );
  assert.equal(intake.projectId, null);
  assert.ok(String(intake.extracted).includes("고객 작성 상호"));
  assert.deepEqual(await bytes(intake), filled);
  const certificate = await saveCustomerFile(
    {
      customerId: customer.id,
      category: "business_registration",
      name: "사업자.pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
    },
    actor,
  );
  const project = await create("projects", {
    name: "같은 고객",
    customerId: customer.id,
    status: "materials",
    settled: false,
  });
  await assert.rejects(
    copyCustomerFile(certificate.id, project.id, actor),
    /참고자료/,
  );
  const copied = await copyCustomerFile(intake.id, project.id, actor);
  assert.equal(copied.projectId, project.id);
  assert.equal(copied.category, "source");
  const other = await save("customers", { name: "다른 고객" }, actor);
  const otherProject = await create("projects", {
    name: "다른 고객",
    customerId: other.id,
    status: "materials",
  });
  await assert.rejects(
    copyCustomerFile(intake.id, otherProject.id, actor),
    /같은 고객/,
  );
  const before = (await list("assets")).length;
  await assert.rejects(
    saveCustomerFile(
      {
        customerId: customer.id,
        category: "business_registration",
        name: "잘못된.pdf",
        buffer: Buffer.from("not a pdf"),
      },
      actor,
    ),
    /파일/,
  );
  await assert.rejects(
    saveCustomerFile(
      {
        customerId: customer.id,
        category: "reference",
        name: "대용량.txt",
        buffer: Buffer.alloc(4 * 1024 * 1024 + 1, 65),
      },
      actor,
    ),
    /4MB/,
  );
  assert.equal((await list("assets")).length, before);
});
