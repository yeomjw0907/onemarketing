import ExcelJS from "exceljs";
import { z } from "zod";
import {
  applicationChannels,
  type ParticipantApplication,
} from "./participant-application-schema";
import {
  applicationListLabels,
  matchesApplication,
} from "./participant-application-filter";
import { accountStatusLabels } from "./participant-account-policy";
const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "";
export async function applicationWorkbook(
  items: ParticipantApplication[],
  status: keyof typeof applicationListLabels,
  search: string,
  selectedIds?: string[],
) {
  let rows = items.filter((i) => matchesApplication(i, status, search));
  if (selectedIds !== undefined) {
    const ids = z.array(z.string().uuid()).min(1).max(100).parse(selectedIds);
    const wanted = new Set(ids);
    if (wanted.size !== ids.length)
      throw new Error("선택한 신청이 중복되었습니다.");
    rows = rows.filter((i) => wanted.has(i.id));
    if (rows.length !== wanted.size)
      throw new Error(
        "선택한 신청이나 검색 조건이 변경되었습니다. 목록을 새로고침 후 다시 선택해주세요.",
      );
  }
  const book = new ExcelJS.Workbook();
  book.creator = "One Marketing";
  const sheet = book.addWorksheet("신청 목록", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = [
    "신청 ID",
    "상태",
    "삭제 전 상태",
    "신청일",
    "이름 · 담당자",
    "휴대전화",
    "이메일",
    "활동 지역",
    "운영 형태",
    "업체 · 운영팀",
    "활동 계정",
    "계정별 승인",
    "정산 방식",
    "은행",
    "계좌번호",
    "개인정보 동의일",
    "검토 담당자",
    "삭제일",
    "삭제 담당자",
    "복구일",
    "참여자 ID",
  ];
  sheet.columns = headers.map((header) => ({
    header,
    width: header.includes("계정") ? 55 : header.includes("ID") ? 38 : 24,
  }));
  for (const item of rows) {
    const d = item.data;
    sheet.addRow([
      item.id,
      d.deletedAt ? "삭제됨" : applicationListLabels[item.status],
      d.deletedAt ? applicationListLabels[item.status] : "",
      date(item.created_at),
      d.name,
      d.phone,
      d.email,
      d.region,
      d.operationType === "managed" ? "여러 계정 운영" : "본인 계정",
      d.teamName || "",
      d.accounts
        .map(
          (a) =>
            `${a.label ? a.label + " · " : ""}${a.channel === "clip" ? "네이버 클립" : applicationChannels[a.channel]} · ${a.url}`,
        )
        .join("\n"),
      d.accounts
        .map(
          (a, index) =>
            `${a.label || `계정 ${index + 1}`} · ${accountStatusLabels[a.approvalStatus || (item.status === "approved" ? "approved" : "pending")]}`,
        )
        .join("\n"),
      d.payment?.method === "bank"
        ? "계좌 송금"
        : d.payment?.method === "kakaopay"
          ? "카카오페이"
          : "",
      d.payment?.method === "bank" ? d.payment.bankName : "",
      d.payment?.method === "bank" ? d.payment.accountNumber : "",
      date(d.consentAt),
      d.reviewedBy || "",
      date(d.deletedAt),
      d.deletedBy || "",
      date(d.restoredAt),
      item.participant_id || "",
    ]);
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };
  sheet.autoFilter = { from: "A1", to: "U1" };
  sheet.eachRow((row, index) => {
    row.alignment = { vertical: "top", wrapText: true };
    if (index > 1) {
      row.getCell(6).numFmt = "@";
      row.getCell(15).numFmt = "@";
    }
  });
  return new Uint8Array(await book.xlsx.writeBuffer());
}
