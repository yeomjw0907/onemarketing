import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  applicationSchema,
  type ParticipantApplication,
} from "../src/lib/participant-application-schema";
import { applicationWorkbook } from "../src/lib/participant-application-export";
import { matchesApplication } from "../src/lib/participant-application-filter";
function fixture(
  status: ParticipantApplication["status"],
  deleted: boolean,
  matching: boolean,
): ParticipantApplication {
  return {
    id: crypto.randomUUID(),
    version: 1,
    status,
    participant_id: status === "approved" ? crypto.randomUUID() : null,
    created_at: "2026-10-16T00:00:00Z",
    updated_at: "2026-10-16T00:00:00Z",
    data: {
      ...applicationSchema.parse({
        name: matching ? "김 이름" : "제외 신청",
        phone: matching ? "010-1111-2222" : "010-9999-8888",
        email: "example@example.com",
        payment: {
          method: "bank",
          bankName: "국민은행",
          accountNumber: "0012345678",
        },
        accounts: [
          {
            id: crypto.randomUUID(),
            channel: "blog",
            url: "https://blog.naver.com/export-test",
            label: "메인 계정",
          },
          {
            id: crypto.randomUUID(),
            channel: "instagram",
            url: "export_test",
            label: "인스타 계정",
          },
        ],
      }),
      consentAt: "2026-10-16T00:00:00Z",
      consentVersion: "test",
      deletedAt: deleted ? "2026-10-16T01:00:00Z" : null,
    },
  };
}
test("모든 상태의 엑셀은 화면과 같은 이름·전화번호 검색을 적용한다", async () => {
  const rows = [
    fixture("new", false, true),
    fixture("new", false, false),
    fixture("approved", false, true),
    fixture("rejected", false, true),
    fixture("new", true, true),
    fixture("rejected", true, false),
  ];
  for (const status of ["new", "approved", "rejected", "deleted"] as const) {
    for (const query of ["김이름", "0101111", "010-1111", "1111"]) {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(
        (await applicationWorkbook(
          rows,
          status,
          query,
        )) as unknown as ExcelJS.Buffer,
      );
      const sheet = book.getWorksheet("신청 목록")!;
      const expected = rows.filter((i) => matchesApplication(i, status, query));
      assert.equal(expected.length, 1);
      assert.equal(sheet.rowCount, expected.length + 1);
      assert.equal(sheet.getRow(2).getCell(1).value, expected[0].id);
      assert.equal(sheet.getRow(2).getCell(6).value, "010-1111-2222");
      assert.equal(sheet.getRow(2).getCell(15).value, "0012345678");
      assert.match(
        String(sheet.getRow(2).getCell(11).value),
        /메인 계정.*blog.naver.com/,
      );
      assert.match(
        String(sheet.getRow(2).getCell(11).value),
        /인스타 계정.*instagram.com/,
      );
    }
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await applicationWorkbook(rows, "new", "")) as unknown as ExcelJS.Buffer,
  );
  assert.equal(book.getWorksheet("신청 목록")!.rowCount, 3);
});
test("엑셀의 사용자 입력은 수식이 되지 않고 검색 결과가 없으면 헤더만 반환한다", async () => {
  const row = fixture("new", false, true);
  row.data.name = '=HYPERLINK("https://example.com","test")';
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await applicationWorkbook([row], "new", "")) as unknown as ExcelJS.Buffer,
  );
  const cell = book.getWorksheet("신청 목록")!.getRow(2).getCell(5);
  assert.equal(cell.type, ExcelJS.ValueType.String);
  assert.equal(cell.value, row.data.name);
  const empty = new ExcelJS.Workbook();
  await empty.xlsx.load(
    (await applicationWorkbook(
      [row],
      "new",
      "없는 이름",
    )) as unknown as ExcelJS.Buffer,
  );
  assert.equal(empty.getWorksheet("신청 목록")!.rowCount, 1);
});

test("네 목록에서 체크한 신청만 내보내고 체크하지 않은 검색 결과는 제외한다", async () => {
  for (const status of ["new", "approved", "rejected", "deleted"] as const) {
    const first = fixture(
      status === "deleted" ? "new" : status,
      status === "deleted",
      true,
    );
    const second = fixture(
      status === "deleted" ? "rejected" : status,
      status === "deleted",
      true,
    );
    const other = fixture(
      status === "deleted" ? "new" : status,
      status === "deleted",
      false,
    );
    const rows = [first, second, other];
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      (await applicationWorkbook(rows, status, "1111", [
        second.id,
      ])) as unknown as ExcelJS.Buffer,
    );
    const sheet = book.getWorksheet("신청 목록")!;
    assert.equal(sheet.rowCount, 2);
    assert.equal(sheet.getRow(2).getCell(1).value, second.id);
    const multiple = new ExcelJS.Workbook();
    await multiple.xlsx.load(
      (await applicationWorkbook(rows, status, "", [
        first.id,
        second.id,
      ])) as unknown as ExcelJS.Buffer,
    );
    assert.equal(multiple.getWorksheet("신청 목록")!.rowCount, 3);
  }
});
test("빈 선택·중복·존재하지 않는 신청·현재 목록 밖 선택은 다운로드를 거절한다", async () => {
  const row = fixture("new", false, true),
    approved = fixture("approved", false, true);
  for (const ids of [
    [],
    [row.id, row.id],
    [crypto.randomUUID()],
    [approved.id],
  ]) {
    await assert.rejects(applicationWorkbook([row, approved], "new", "", ids));
  }
  await assert.rejects(
    applicationWorkbook([row], "new", "없는 이름", [row.id]),
    /변경/,
  );
});
