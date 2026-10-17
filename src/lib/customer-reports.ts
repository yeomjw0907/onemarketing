import { randomBytes, createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { z } from "zod";
import { audit, create, get, lock, query, transaction, update } from "./db";
import { stageLabels, type RecordData } from "./types";
import { requireConfirmedProduct } from "./product-understanding";
const sharedKeywordsSchema = z.object({
  main: z.array(z.string()),
  secondary: z.array(z.string()),
  reason: z.string(),
  productName: z.string(),
  approvedAt: z.string(),
  productApprovedAt: z.string(),
  sourceHash: z.string(),
  volumeVerified: z.literal(false),
});
type PublicKeywords = Pick<
  z.infer<typeof sharedKeywordsSchema>,
  | "main"
  | "secondary"
  | "reason"
  | "productName"
  | "approvedAt"
  | "volumeVerified"
>;

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function issueReportLink(
  customerId: string,
  days: unknown,
  actor: string,
) {
  const expiryDays = z.number().int().min(1).max(365).parse(days);
  return transaction(async () => {
    const customer = await get(customerId);
    if (customer?.kind !== "customers") throw new Error("고객을 선택하세요.");
    const token = randomBytes(32).toString("hex");
    const link = await create("report_links", {
      customerId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      revokedAt: null,
      actor,
    });
    await audit(actor, "report-link-issued", customerId, {
      linkId: link.id,
      expiresAt: link.expiresAt,
    });
    return { linkId: link.id, token, expiresAt: String(link.expiresAt) };
  });
}
export async function revokeReportLink(
  customerId: string,
  linkId: string,
  actor: string,
) {
  return transaction(async () => {
    await lock("report-link:" + linkId);
    const link = await get(linkId);
    if (link?.kind !== "report_links" || link.customerId !== customerId)
      throw new Error("고객의 보고 링크를 선택하세요.");
    await update(
      link.id,
      { revokedAt: new Date().toISOString() },
      link.version,
    );
    await audit(actor, "report-link-revoked", customerId, { linkId });
  });
}
export type CustomerReport = {
  customerName: string;
  generatedAt: string;
  updatedAt: string;
  projects: {
    name: string;
    status: string;
    due: string;
    updatedAt: string;
    keywords?: PublicKeywords | null;
    tasks: {
      label: string;
      channel: string;
      participant: string;
      status: string;
      link: string;
      verifiedAt: string;
    }[];
  }[];
};
export async function customerReport(
  token: string,
): Promise<CustomerReport | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const links = await query<{ data: RecordData }>(
    "select data from records where kind='report_links' and data->>'tokenHash'=$1",
    [hash(token)],
  );
  const link = links[0]?.data;
  if (
    !link ||
    link.revokedAt ||
    !(Date.parse(String(link.expiresAt)) > Date.now())
  )
    return null;
  const customer = await get(String(link.customerId));
  if (customer?.kind !== "customers") return null;
  const projects = (
    await query<{ data: RecordData }>(
      "select data from records where kind='projects' and data->>'customerId'=$1 order by created_at desc",
      [customer.id],
    )
  ).map((r) => r.data);
  const ids = projects.map((p) => p.id);
  const tasks = ids.length
    ? (
        await query<{ data: RecordData }>(
          "select data from records where kind='tasks' and data->>'projectId'=any($1::text[])",
          [ids],
        )
      ).map((r) => r.data)
    : [];
  const dates = [
    customer.updatedAt,
    ...projects.map((p) => p.updatedAt),
    ...tasks.map((t) => t.updatedAt),
  ].sort();
  return {
    customerName: String(customer.brand || customer.name),
    generatedAt: new Date().toISOString(),
    updatedAt: dates.at(-1)!,
    projects: await Promise.all(
      projects.map(async (p) => {
        let keywords: PublicKeywords | null = null;
        if (p.confirmedKeywordAnalysis) {
          try {
            const u = await requireConfirmedProduct(p),
              shared = sharedKeywordsSchema.parse(p.confirmedKeywordAnalysis);
            if (
              shared.sourceHash === u.sourceHash &&
              shared.productApprovedAt === u.approvedAt
            )
              keywords = {
                main: shared.main,
                secondary: shared.secondary,
                reason: shared.reason,
                productName: shared.productName,
                approvedAt: shared.approvedAt,
                volumeVerified: shared.volumeVerified,
              };
          } catch {}
        }
        const ts = tasks
          .filter((t) => t.projectId === p.id)
          .sort((a, b) => Number(a.order) - Number(b.order));
        const people = [
          ...new Set(
            ts
              .filter((t) => t.participantId)
              .map((t) => String(t.participantId)),
          ),
        ];
        return {
          name: String(p.name),
          status: String(p.status),
          due: String(p.due || ""),
          updatedAt: p.updatedAt,
          keywords,
          tasks: ts.map((t) => {
            let url = "";
            if (["submitted", "verified"].includes(String(t.status))) {
              try {
                const u = new URL(String(t.link));
                if (["https:", "http:"].includes(u.protocol)) url = u.href;
              } catch {}
            }
            return {
              label: String(t.name),
              channel: t.channel === "blog" ? "블로그" : "클립",
              participant: t.participantId
                ? `참여자 ${people.indexOf(String(t.participantId)) + 1}`
                : "배정 대기",
              status: String(t.status),
              link: url,
              verifiedAt:
                t.status === "verified" ? String(t.verifiedAt || "") : "",
            };
          }),
        };
      }),
    ),
  };
}
export const reportStatus = (value: string) =>
  ({
    planned: "준비 중",
    changes: "제작 중",
    review: "검수 중",
    approved: "전달 준비",
    delivered: "게시 대기",
    submitted: "게시 확인 중",
    verified: "게시 확인 완료",
    cancelled: "취소",
  })[value] ||
  stageLabels[value] ||
  "진행 중";
export async function reportWorkbook(report: CustomerReport) {
  const book = new ExcelJS.Workbook();
  book.creator = "One Marketing";
  book.subject = "고객 캠페인 진행·완료 보고";
  const summary = book.addWorksheet("1_보고요약");
  summary.addRows([
    ["고객", report.customerName],
    ["보고서 생성일", report.generatedAt],
    ["최종 업데이트", report.updatedAt],
    [],
    [
      "프로젝트",
      "상태",
      "마감일",
      "블로그 확인 / 계약 작업",
      "클립 확인 / 계약 작업",
    ],
  ]);
  for (const p of report.projects) {
    const progress = (channel: string) => {
      const ts = p.tasks.filter(
        (t) => t.channel === channel && t.status !== "cancelled",
      );
      return `${ts.filter((t) => t.status === "verified").length} / ${ts.length}`;
    };
    summary.addRow([
      p.name,
      reportStatus(p.status),
      p.due,
      progress("블로그"),
      progress("클립"),
    ]);
  }
  for (const [name, channel] of [
    ["2_블로그게시", "블로그"],
    ["3_클립게시", "클립"],
  ]) {
    const sheet = book.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.addRow([
      "프로젝트",
      "참여자",
      "콘텐츠명",
      "게시 링크",
      "확인일 (한국 시간)",
      "상태",
    ]);
    for (const p of report.projects)
      for (const t of p.tasks.filter((t) => t.channel === channel)) {
        const row = sheet.addRow([
          p.name,
          t.participant,
          t.label,
          t.link ? { text: t.link, hyperlink: t.link } : "",
          t.verifiedAt
            ? new Date(t.verifiedAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })
            : "",
          reportStatus(t.status),
        ]);
        if (t.link)
          row.getCell(4).font = {
            color: { argb: "FF2563EB" },
            underline: true,
          };
      }
    sheet.autoFilter = "A1:F1";
  }
  const keywords = book.addWorksheet("확정 키워드");
  keywords.addRow([
    "프로젝트",
    "제품",
    "핵심 키워드",
    "보조 키워드",
    "선정 이유",
    "내부 확정일",
  ]);
  for (const p of report.projects)
    if (p.keywords)
      keywords.addRow([
        p.name,
        p.keywords.productName,
        p.keywords.main.join(", "),
        p.keywords.secondary.join(", "),
        p.keywords.reason,
        p.keywords.approvedAt,
      ]);
  keywords.columns.forEach((c) => {
    c.width = 28;
  });
  for (const s of book.worksheets) {
    s.columns.forEach((c, i) => (c.width = i === 3 ? 70 : 30));
    s.eachRow((r) => (r.alignment = { vertical: "top", wrapText: true }));
    const header = s.getRow(s === summary ? 5 : 1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
    header.height = 28;
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
