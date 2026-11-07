import sharp from "sharp";
import { readFileSync } from "node:fs";
import path from "node:path";
import { blogPosterSchema } from "./blog-image-policy";

export const BLOG_POSTER_SIZE = { width: 1024, height: 1536 } as const;
let registered = false;

/** Deterministic type; no crop, product masking, generated letters, or extra AI call. */
export async function composeBlogPoster(photo: Buffer, input: unknown) {
  const design = blogPosterSchema.parse(input);
  if (!design.confirmed)
    throw new Error("포스터 문구와 실제 가격을 확인한 뒤 승인해주세요.");
  const { createCanvas, GlobalFonts } = await import("@napi-rs/canvas");
  if (!registered) {
    const font = readFileSync(
      path.join(process.cwd(), "assets/fonts/NanumGothic-Bold.ttf"),
    );
    if (!GlobalFonts.register(font, "OneMarketingBlog"))
      throw new Error("포스터 한글 글꼴을 불러오지 못했습니다.");
    registered = true;
  }
  const { width, height } = BLOG_POSTER_SIZE;
  const canvas = createCanvas(width, height),
    ctx = canvas.getContext("2d");
  const dark = design.palette === "dark";
  ctx.fillStyle = dark ? "#202725" : "#f5f1e8";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = dark ? "#faf8ef" : "#29251f";
  ctx.textBaseline = "top";
  function lines(text: string, size: number) {
    ctx.font = `${size}px OneMarketingBlog`;
    const result: string[] = [];
    let line = "";
    const chars = [
      ...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text),
    ].map((s) => s.segment);
    for (const char of chars) {
      if (line && ctx.measureText(line + char).width > 928) {
        result.push(line.trimEnd());
        line = char.trimStart();
      } else line += char;
    }
    if (line) result.push(line);
    return result;
  }
  function text(
    value: string,
    top: number,
    maxLines: number,
    preferred: number,
    minimum: number,
  ) {
    if (!value) return top;
    let size = preferred,
      wrapped = lines(value, size);
    while (wrapped.length > maxLines && size > minimum)
      wrapped = lines(value, --size);
    if (wrapped.length > maxLines)
      throw new Error("문구가 너무 깁니다. 줄여서 다시 승인해주세요.");
    ctx.font = `${size}px OneMarketingBlog`;
    wrapped.forEach((line, i) => ctx.fillText(line, 48, top + i * size * 1.3));
    return top + (wrapped.length - 1) * size * 1.3 + size;
  }
  const headlineBottom = text(design.headline, 54, 3, 76, 56);
  text(design.productName, 1320, 2, 36, 30);
  text(design.price, 1420, 1, 34, 28);
  text(design.brand, 1480, 1, 24, 22);
  const frame = {
    left: 48,
    top: Math.max(184, Math.ceil(headlineBottom + 36)),
    width: 928,
    height: 0,
  };
  frame.height = 1288 - frame.top;
  const fittedPhoto = await sharp(photo, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize(frame.width, frame.height, {
      fit: "contain",
      background: dark ? "#202725" : "#f5f1e8",
    })
    .png()
    .toBuffer();
  return sharp(canvas.toBuffer("image/png"))
    .composite([
      {
        input: fittedPhoto,
        left: frame.left,
        top: frame.top,
      },
    ])
    .png()
    .toBuffer();
}
