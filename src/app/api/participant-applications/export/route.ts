import { requireActor, sameOrigin } from "@/lib/auth";
import { listApplications } from "@/lib/participant-applications";
import { applicationWorkbook } from "@/lib/participant-application-export";
import {
  applicationListLabels,
  applicationDateRangeError,
} from "@/lib/participant-application-filter";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function exportRequest(request: Request, selectedPost = false) {
  try {
    await requireActor();
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    let params = new URL(request.url).searchParams;
    let postedIds: string[] | undefined;
    if (selectedPost) {
      sameOrigin(request);
      const text = await request.text();
      if (text.length > 4000000) throw new Error("선택 내역이 너무 큽니다.");
      const data = z
        .object({
          status: z.enum(["new", "approved", "rejected", "deleted"]),
          search: z.string().max(200).default(""),
          sort: z.enum(["newest", "oldest"]).default("newest"),
          startDate: z.string().max(10).default(""),
          endDate: z.string().max(10).default(""),
          ids: z.array(z.string().uuid()).min(1).max(100000),
        })
        .parse(JSON.parse(text));
      postedIds = data.ids;
      params = new URLSearchParams({
        status: data.status,
        search: data.search,
        sort: data.sort,
        startDate: data.startDate,
        endDate: data.endDate,
      });
    }
    const status = z
      .enum(["new", "approved", "rejected", "deleted"])
      .parse(params.get("status"));
    const search = z
      .string()
      .max(200)
      .parse(params.get("search") || "")
      .trim();
    const order = z
      .enum(["newest", "oldest"])
      .parse(params.get("sort") || "newest");
    const range = {
      startDate: params.get("startDate") || "",
      endDate: params.get("endDate") || "",
    };
    const rangeError = applicationDateRangeError(range);
    if (rangeError)
      return Response.json({ error: rangeError }, { status: 400 });
    const selectedIds =
      postedIds ||
      (params.has("ids")
        ? z
            .array(z.string().uuid())
            .min(1)
            .max(100000)
            .parse((params.get("ids") || "").split(","))
        : undefined);
    const date = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(new Date());
    const filename = `체험단_신청_${applicationListLabels[status]}_${date}${selectedIds ? `_선택${selectedIds.length}건` : search || range.startDate || range.endDate ? "_검색결과" : ""}.xlsx`;
    return new Response(
      await applicationWorkbook(
        await listApplications(),
        status,
        search,
        selectedIds,
        range,
        order,
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

export async function GET(request: Request) {
  return exportRequest(request);
}
export async function POST(request: Request) {
  return exportRequest(request, true);
}
