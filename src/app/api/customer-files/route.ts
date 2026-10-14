import { z } from "zod";
import { requireActor, sameOrigin } from "@/lib/auth";
import { saveCustomerFile, copyCustomerFile } from "@/lib/customer-files";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = z
        .object({ assetId: z.string().uuid(), projectId: z.string().uuid() })
        .parse(await request.json());
      return Response.json(
        await copyCustomerFile(body.assetId, body.projectId, actor),
      );
    }
    if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024 + 65536)
      throw new Error("파일당 4MB 이하로 업로드하세요.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("파일을 선택하세요.");
    return Response.json(
      await saveCustomerFile(
        {
          customerId: z.string().uuid().parse(form.get("customerId")),
          category: z.string().parse(form.get("category")),
          name: file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
        },
        actor,
      ),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "파일 등록에 실패했습니다." },
      { status: 400 },
    );
  }
}
