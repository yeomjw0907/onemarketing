import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { requireActor, sameOrigin } from "@/lib/auth";
import { approvedBundle, recordDelivery } from "@/lib/deliveries";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: Request) {
  try {
    await requireActor();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) throw new Error("프로젝트를 선택하세요.");
    const bundle = await approvedBundle(
      projectId,
      url.searchParams.getAll("taskId").length
        ? url.searchParams.getAll("taskId")
        : undefined,
    );
    const archive = new ZipArchive({ zlib: { level: 5 } });
    const stream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;
    for (const entry of bundle.entries)
      archive.append(entry.buffer, { name: entry.path });
    archive.finalize().catch(() => archive.destroy());
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(bundle.project.name) + ".zip")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "ZIP 생성 실패" },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    return Response.json(
      await recordDelivery(await request.json(), await requireActor()),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "전달 기록 실패" },
      { status: 400 },
    );
  }
}
