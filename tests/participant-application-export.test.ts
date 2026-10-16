import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  applicationSchema,
  type ParticipantApplication,
} from "../src/lib/participant-application-schema";
import { applicationWorkbook } from "../src/lib/participant-application-export";
import {
  matchesApplication,
  applicationDateRangeError,
  applicationPresetRange,
  sortApplications,
} from "../src/lib/participant-application-filter";
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

test("신청일 기간은 한국 시간 시작·종료일 전체를 포함하고 모든 상태와 엑셀에 적용된다", async () => {
  for (const status of ["new", "approved", "rejected", "deleted"] as const) {
    const rows = [
      "2026-10-14T14:59:59.999Z",
      "2026-10-14T15:00:00Z",
      "2026-10-15T14:59:59.999Z",
      "2026-10-15T15:00:00Z",
    ].map((created_at) => ({
      ...fixture(
        status === "deleted" ? "rejected" : status,
        status === "deleted",
        true,
      ),
      created_at,
    }));
    const range = { startDate: "2026-10-15", endDate: "2026-10-15" };
    assert.deepEqual(
      rows
        .filter((i) => matchesApplication(i, status, "", range))
        .map((i) => i.id),
      [rows[1].id, rows[2].id],
    );
    assert.equal(
      rows.filter((i) =>
        matchesApplication(i, status, "", { startDate: "2026-10-15" }),
      ).length,
      3,
    );
    assert.equal(
      rows.filter((i) =>
        matchesApplication(i, status, "", { endDate: "2026-10-15" }),
      ).length,
      3,
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      (await applicationWorkbook(
        rows,
        status,
        "1111",
        undefined,
        range,
      )) as unknown as ExcelJS.Buffer,
    );
    assert.equal(book.getWorksheet("신청 목록")!.rowCount, 3);
    const selected = new ExcelJS.Workbook();
    await selected.xlsx.load(
      (await applicationWorkbook(
        rows,
        status,
        "김이름",
        [rows[2].id],
        range,
      )) as unknown as ExcelJS.Buffer,
    );
    assert.equal(selected.getWorksheet("신청 목록")!.rowCount, 2);
    assert.equal(
      selected.getWorksheet("신청 목록")!.getRow(2).getCell(1).value,
      rows[2].id,
    );
    await assert.rejects(
      applicationWorkbook(rows, status, "", [rows[0].id], range),
      /변경/,
    );
  }
});
test("잘못된 날짜와 역전된 기간은 전체 다운로드로 바뀌지 않고 오류를 반환한다", async () => {
  const row = fixture("new", false, true);
  for (const range of [
    { startDate: "2026-10-17", endDate: "2026-10-16" },
    { startDate: "2026-02-30" },
    { endDate: "not-a-date" },
  ]) {
    assert.ok(applicationDateRangeError(range));
    assert.equal(matchesApplication(row, "new", "", range), false);
    await assert.rejects(
      applicationWorkbook([row], "new", "", undefined, range),
    );
  }
  assert.equal(applicationDateRangeError({}), "");
  assert.equal(applicationDateRangeError({ startDate: "2024-02-29" }), "");
});

test("빠른 기간 선택은 한국 날짜와 오늘 포함 7일·월말·연말·윤년을 계산한다", () => {
  const beforeMidnight = new Date("2026-10-15T14:59:59Z"),
    afterMidnight = new Date("2026-10-15T15:00:00Z");
  assert.deepEqual(applicationPresetRange("today", beforeMidnight), {
    startDate: "2026-10-15",
    endDate: "2026-10-15",
  });
  assert.deepEqual(applicationPresetRange("today", afterMidnight), {
    startDate: "2026-10-16",
    endDate: "2026-10-16",
  });
  assert.deepEqual(applicationPresetRange("last7", afterMidnight), {
    startDate: "2026-10-10",
    endDate: "2026-10-16",
  });
  assert.deepEqual(applicationPresetRange("thisMonth", afterMidnight), {
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  });
  assert.deepEqual(applicationPresetRange("lastMonth", afterMidnight), {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });
  const newYear = new Date("2025-12-31T15:00:00Z");
  assert.deepEqual(applicationPresetRange("last7", newYear), {
    startDate: "2025-12-26",
    endDate: "2026-01-01",
  });
  assert.deepEqual(applicationPresetRange("lastMonth", newYear), {
    startDate: "2025-12-01",
    endDate: "2025-12-31",
  });
  assert.deepEqual(
    applicationPresetRange("lastMonth", new Date("2024-03-01T00:00:00Z")),
    { startDate: "2024-02-01", endDate: "2024-02-29" },
  );
});
test("빠른 선택 기간은 모든 상태의 검색 결과·선택 엑셀에 그대로 적용된다", async () => {
  for (const preset of ["today", "last7", "thisMonth", "lastMonth"] as const) {
    const range = applicationPresetRange(
      preset,
      new Date("2026-10-16T00:00:00Z"),
    );
    for (const status of ["new", "approved", "rejected", "deleted"] as const) {
      const included = {
        ...fixture(
          status === "deleted" ? "rejected" : status,
          status === "deleted",
          true,
        ),
        created_at: `${range.startDate}T00:00:00+09:00`,
      };
      const excluded = {
        ...included,
        id: crypto.randomUUID(),
        created_at: "2026-08-01T00:00:00+09:00",
      };
      assert.equal(matchesApplication(included, status, "1111", range), true);
      assert.equal(matchesApplication(excluded, status, "1111", range), false);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(
        (await applicationWorkbook(
          [included, excluded],
          status,
          "1111",
          [included.id],
          range,
        )) as unknown as ExcelJS.Buffer,
      );
      assert.equal(book.getWorksheet("신청 목록")!.rowCount, 2);
      assert.equal(
        book.getWorksheet("신청 목록")!.getRow(2).getCell(1).value,
        included.id,
      );
    }
  }
});

test("신청일 정렬은 네 목록과 검색·기간·선택 엑셀에서 같은 순서로 적용된다", async () => {
  for (const status of ["new", "approved", "rejected", "deleted"] as const) {
    const rows = [
      "2026-10-16T00:00:00Z",
      "2026-10-14T00:00:00Z",
      "2026-10-15T00:00:00Z",
    ].map((created_at) => ({
      ...fixture(
        status === "deleted" ? "rejected" : status,
        status === "deleted",
        true,
      ),
      created_at,
    }));
    const originalIds = rows.map((i) => i.id);
    for (const order of ["newest", "oldest"] as const) {
      const expected =
        order === "newest"
          ? [rows[0], rows[2], rows[1]]
          : [rows[1], rows[2], rows[0]];
      assert.deepEqual(
        sortApplications(rows, order).map((i) => i.id),
        expected.map((i) => i.id),
      );
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(
        (await applicationWorkbook(
          rows,
          status,
          "1111",
          undefined,
          { startDate: "2026-10-14", endDate: "2026-10-16" },
          order,
        )) as unknown as ExcelJS.Buffer,
      );
      const sheet = book.getWorksheet("신청 목록")!;
      assert.deepEqual(
        [2, 3, 4].map((n) => sheet.getRow(n).getCell(1).value),
        expected.map((i) => i.id),
      );
      const selected = new ExcelJS.Workbook();
      await selected.xlsx.load(
        (await applicationWorkbook(
          rows,
          status,
          "1111",
          [rows[0].id, rows[1].id],
          {},
          order,
        )) as unknown as ExcelJS.Buffer,
      );
      const wanted = expected.filter((i) => i.id !== rows[2].id);
      assert.deepEqual(
        [2, 3].map(
          (n) => selected.getWorksheet("신청 목록")!.getRow(n).getCell(1).value,
        ),
        wanted.map((i) => i.id),
      );
    }
    assert.deepEqual(
      rows.map((i) => i.id),
      originalIds,
    );
  }
});
test("신청일이 같은 행은 식별자로 순서를 고정한다", () => {
  const a = {
    ...fixture("new", false, true),
    id: "00000000-0000-4000-8000-000000000001",
  };
  const b = { ...a, id: "00000000-0000-4000-8000-000000000002" };
  for (const order of ["newest", "oldest"] as const)
    assert.deepEqual(
      sortApplications([b, a], order).map((i) => i.id),
      [a.id, b.id],
    );
});
