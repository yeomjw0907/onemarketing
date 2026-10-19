import { requireActor } from "@/lib/auth";
import sharp from "sharp";
import { clipTextOverlay, clipHeadingOverlay } from "@/lib/clip-template";
import { resolveTitleStyle, resolveClipLayout } from "@/lib/clip-layout";
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
    const edit = {
      titleLead: z
        .string()
        .max(24)
        .parse(q.get("lead") || ""),
      titleAccent: z
        .string()
        .max(24)
        .parse(q.get("accent") || ""),
      layout: z
        .enum(["auto", "split", "overlay"])
        .parse(q.get("layout") || "auto"),
      contentKind: z
        .enum(["service", "product", "story"])
        .parse(q.get("kind") || "product"),
      accentColor: z
        .enum(["yellow", "red", "mint"])
        .parse(q.get("color") || "yellow"),
    };
    const heading = await clipHeadingOverlay(
      edit,
      title,
      resolveTitleStyle(id, seed).id,
    );
    const meta = await sharp(heading).metadata();
    const disclosure = await clipTextOverlay("유료 광고", "disclosure");
    const dm = await sharp(disclosure).metadata();
    const split = resolveClipLayout(edit) === "split";
    const body = await sharp({
      create: { width: 720, height: 900, channels: 4, background: "#e5e8eb" },
    })
      .png()
      .toBuffer();
    const preview = await sharp({
      create: {
        width: 720,
        height: 1280,
        channels: 4,
        background: split ? "black" : "#b0b8c1",
      },
    })
      .composite([
        ...(split ? [{ input: body, left: 0, top: 340 }] : []),
        { input: disclosure, left: Math.floor((720 - dm.width!) / 2), top: 64 },
        { input: heading, left: Math.floor((720 - meta.width!) / 2), top: 140 },
      ])
      .png()
      .toBuffer();
    return new Response(new Uint8Array(preview), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "로그인과 제목 입력을 확인하세요." },
      { status: 400 },
    );
  }
}
