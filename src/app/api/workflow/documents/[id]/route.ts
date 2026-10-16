import { requireActor } from "@/lib/auth";
import { get } from "@/lib/db";
import { quotePDF, proposalPDF, quoteWorkbook } from "@/lib/customer-pdfs";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireActor();
    const { id } = await params;
    const d = await get(id);
    if (d?.kind !== "quote_drafts")
      return new Response("견적 없음", { status: 404 });
    const type = new URL(request.url).searchParams.get("type") || "quote";
    const bytes =
      type === "xlsx"
        ? await (await quoteWorkbook(d)).xlsx.writeBuffer()
        : type === "proposal"
          ? await proposalPDF(d)
          : await quotePDF(d);
    return new Response(new Uint8Array(bytes as ArrayBuffer), {
      headers: {
        "Content-Type":
          type === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": `${type === "xlsx" ? "attachment" : "inline"}; filename="${type}-${id}.${type === "xlsx" ? "xlsx" : "pdf"}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "문서 생성 실패" },
      { status: 400 },
    );
  }
}
