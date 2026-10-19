import { requireActor } from "@/lib/auth";
import { clipTextOverlay } from "@/lib/clip-template";
import { resolveTitleStyle } from "@/lib/clip-layout";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    await requireActor();
    const q = new URL(request.url).searchParams;
    const title = z.string().trim().min(1).max(36).parse(q.get("title"));
    const id = z
      .enum(["auto", "clean", "impact", "editorial", "pop"])
      .parse(q.get("style") || "auto");
    const seed = z
      .string()
      .max(200)
      .parse(q.get("seed") || "");
    return new Response(
      new Uint8Array(
        await clipTextOverlay(title, "title", resolveTitleStyle(id, seed).id),
      ),
      {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "로그인과 제목 입력을 확인하세요." },
      { status: 400 },
    );
  }
}
