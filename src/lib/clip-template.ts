import sharp from "sharp";
import path from "node:path";
// Rasterise real font glyphs first, then grow their alpha mask to create a readable outline.
export async function clipTextOverlay(
  value: string,
  role: "title" | "caption" | "disclosure",
) {
  const escape = (v: string) =>
    v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  let size = role === "title" ? 48 : role === "disclosure" ? 22 : 34;
  const width = role === "disclosure" ? 180 : 580;
  const color = role === "caption" ? "#fff27a" : "white";
  const render = (fontSize: number) =>
    sharp({
      text: {
        text: `<span foreground="${color}"><b>${escape(value)}</b></span>`,
        font: `NanumGothic ${fontSize}`,
        fontfile: path.resolve("assets/fonts/NanumGothic-Regular.ttf"),
        width,
        align: "center",
        rgba: true,
      },
    })
      .extend({
        top: 6,
        bottom: 6,
        left: 6,
        right: 6,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  let glyph = await render(size);
  while (
    role === "title" &&
    (await sharp(glyph).metadata()).height! > size * 2.6 + 12 &&
    size > 30
  ) {
    size -= 2;
    glyph = await render(size);
  }
  const meta = await sharp(glyph).metadata();
  const mask = await sharp(glyph).extractChannel(3).raw().toBuffer();
  const radius = role === "title" ? 3 : 2,
    w = meta.width!,
    h = meta.height!;
  const expanded = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let value = 0;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h)
            value = Math.max(value, mask[yy * w + xx]);
        }
      expanded[y * w + x] = value;
    }
  const alpha = await sharp(expanded, {
    raw: { width: w, height: h, channels: 1 },
  })
    .png()
    .toBuffer();
  const outline = await sharp({
    create: {
      width: meta.width!,
      height: meta.height!,
      channels: 3,
      background: "black",
    },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return sharp(outline)
    .composite([{ input: glyph }])
    .png()
    .toBuffer();
}
