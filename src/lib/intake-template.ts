import ExcelJS from "exceljs";

export async function customerIntakeTemplate() {
  const book = new ExcelJS.Workbook();
  book.creator = "One Marketing";
  book.subject = "고객 작성용 마케팅 제작 자료 v1";
  const sheet = (
    name: string,
    headers: string[],
    rows: (string | number)[][],
    widths: number[],
  ) => {
    const s = book.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    s.addRow(headers);
    rows.forEach((row) => s.addRow(row));
    s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    s.getRow(1).height = 28;
    widths.forEach((width, i) => (s.getColumn(i + 1).width = width));
    s.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
    s.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
    return s;
  };
  sheet(
    "1_작성안내",
    ["항목", "안내"],
    [
      [
        "사용 방법",
        "고객·브랜드, 제품정보, 제작요청, 자료목록 시트의 작성란을 채워 담당자에게 전달해주세요. 모르는 내용은 미정으로 적어주세요.",
      ],
      [
        "기본 제작안",
        "원고 5개 + 원고당 이미지 3장(총 15장) + 10초 클립 5개. 실제 계약 범위는 담당자와 확인해주세요.",
      ],
      [
        "입력 기준",
        "제품 사실과 근거를 적어주세요. 근거 없는 효능·검색량·체험담을 적지 마세요. 사업자번호는 텍스트로 입력하세요.",
      ],
      [
        "파일 전달",
        "작성본은 XLSX로 저장하고 제품 사진·로고·사업자등록증은 별도 파일로 전달해주세요. 매크로·수식·외부 연결을 넣지 마세요.",
      ],
      [
        "사진·영상",
        "제품 정면·측면·포장 사진, 보존할 로고·색상·표기를 제공해주세요. 참고 링크는 URL 텍스트로 기재해주세요.",
      ],
      [
        "확인 사항",
        "실제 체험 유무, 게시 범위, 음악·이미지 사용 권한, 수정 담당자와 납기를 확인해주세요.",
      ],
      ["양식 버전", "v1 · One Marketing"],
    ],
    [22, 100],
  );
  sheet(
    "2_고객브랜드",
    ["항목", "작성란", "작성 도움말"],
    [
      ["고객명/상호", "", "계약에 사용할 상호"],
      ["사업자등록번호", "", "10자리. 예: 000-00-00000"],
      ["브랜드명", "", "홍보에 사용할 브랜드명"],
      ["담당자/연락처", "", "자료 확인 담당자와 연락 방법"],
      ["홈페이지/판매 링크", "", "URL 입력"],
      ["주요 타깃", "", "연령·관심사·구매 상황"],
      ["브랜드 말투", "", "차분한 정보형 등"],
      ["브랜드 색상/무드", "", "색상 코드·참고 이미지 설명"],
      ["필수 표현", "", "반드시 포함할 문구"],
      ["금지 표현", "", "과장·비교·효능 등 피할 내용"],
      ["자료 사용 권한", "", "제공 사진·로고·영상의 사용 허용 범위"],
    ],
    [25, 55, 55],
  );
  sheet(
    "3_제품정보",
    ["항목", "작성란", "근거/출처/확인 상태"],
    [
      ["제품명/SKU", "", ""],
      ["제품 소개", "", ""],
      ["성분/규격/구성", "", ""],
      ["가격/판매 기간", "", "기준일 포함"],
      ["사용 방법", "", ""],
      ["강조할 특징 1", "", "증빙 파일명 또는 공식 URL"],
      ["강조할 특징 2", "", ""],
      ["강조할 특징 3", "", ""],
      ["제품 보존 요소", "", "외형·로고·포장 문구·색상"],
      ["금지/주의 사항", "", ""],
      [
        "제품 제공/실제 체험 여부",
        "",
        "실제 사용 경험이 있는 사람과 자료 유무",
      ],
    ],
    [25, 55, 55],
  );
  const requests = sheet(
    "4_제작요청",
    [
      "세트",
      "블로그 소구점/주제",
      "필수 키워드",
      "이미지 3장 방향",
      "클립 10초 방향",
      "게시/활용 채널",
      "희망 납기",
      "추가 요청",
    ],
    Array.from({ length: 5 }, (_, i) => [
      i + 1,
      "",
      "",
      "",
      "",
      "블로그 + 네이버 클립",
      "",
      "",
    ]),
    [10, 35, 25, 45, 45, 28, 20, 40],
  );
  requests.getColumn(7).numFmt = "@";
  sheet(
    "5_자료목록",
    [
      "파일명/참고 URL",
      "자료 종류",
      "관련 제품/세트",
      "설명·강조점",
      "사용 권한/주의사항",
    ],
    Array.from({ length: 10 }, () => ["", "", "", "", ""]),
    [50, 25, 25, 50, 50],
  );
  return Buffer.from(await book.xlsx.writeBuffer());
}
