import { requireActor } from "@/lib/auth";
import { listApplications } from "@/lib/participant-applications";
import { applicationWorkbook } from "@/lib/participant-application-export";
import { applicationListLabels } from "@/lib/participant-application-filter";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    await requireActor();
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const params = new URL(request.url).searchParams;
    const status = z
      .enum(["new", "approved", "rejected", "deleted"])
      .parse(params.get("status"));
    const search = z
      .string()
      .max(200)
      .parse(params.get("search") || "")
      .trim();
    const selectedIds = params.has("ids")
      ? z
          .array(z.string().uuid())
          .min(1)
          .max(100)
          .parse((params.get("ids") || "").split(","))
      : undefined;
    const date = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(new Date());
    const filename = `체험단_신청_${applicationListLabels[status]}_${date}${selectedIds ? `_선택${selectedIds.length}건` : search ? "_검색결과" : ""}.xlsx`;
    return new Response(
      await applicationWorkbook(
        await listApplications(),
        status,
        search,
        selectedIds,
      ),
      {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "엑셀 다운로드에 실패했습니다. 목록을 새로고침한 뒤 다시 시도해주세요.",
      },
      { status: 400 },
    );
  }
}
