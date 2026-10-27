import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import {
  advertiserProducts,
  saveAdvertiserProduct,
  addAdvertiserProductFile,
  advertiserProductFile,
} from "@/lib/advertiser-products";
import {
  workflowBody,
  workflowBuffer,
  workflowFailure,
  privateHeaders,
  WorkflowError,
} from "@/lib/workflow-http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function identity() {
  const a = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  if (!a) throw new WorkflowError("광고주 로그인이 필요합니다.", 401);
  return a.id;
}
export async function GET(request: Request) {
  try {
    const id = await identity(),
      fileId = new URL(request.url).searchParams.get("file");
    if (fileId) {
      const { file, buffer } = await advertiserProductFile(id, fileId);
      return new Response(new Uint8Array(buffer), {
        headers: {
          ...privateHeaders,
          "Content-Type": String(file.mime),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(file.name))}`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return Response.json(await advertiserProducts(id), {
      headers: privateHeaders,
    });
  } catch (e) {
    return workflowFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const id = await identity();
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      const buffer = await workflowBuffer(request, 4 * 1024 * 1024 + 65536);
      const form = await new Response(new Uint8Array(buffer), {
        headers: { "Content-Type": request.headers.get("content-type")! },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File))
        throw new WorkflowError("파일을 선택해주세요.");
      return Response.json(
        await addAdvertiserProductFile(
          id,
          String(form.get("productId")),
          file.name,
          Buffer.from(await file.arrayBuffer()),
        ),
        { headers: privateHeaders },
      );
    }
    return Response.json(
      await saveAdvertiserProduct(id, await workflowBody(request)),
      { headers: privateHeaders },
    );
  } catch (e) {
    return workflowFailure(e);
  }
}
