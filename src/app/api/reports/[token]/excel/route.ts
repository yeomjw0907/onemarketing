import { customerReport, reportWorkbook } from "@/lib/customer-reports";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const report = await customerReport(token);
    if (!report)
      return Response.json(
        { error: "사용할 수 없거나 만료된 링크입니다." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    const active = report.projects.filter((p) => p.status !== "cancelled");
    const complete =
      active.length > 0 && active.every((p) => p.status === "completed");
    const filename = `${report.customerName}_${complete ? "완료" : "진행"}보고_${new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date())}.xlsx`;
    return new Response(new Uint8Array(await reportWorkbook(report)), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "보고서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
