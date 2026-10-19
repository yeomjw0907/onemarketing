import sharp from "sharp";
export async function videoStartFrame(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .resize(720, 1280, {
      fit: "contain",
      background: "#ffffff",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
