import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { create, get, query, transaction, lock } from "./db";
import { putObject, removeObjects } from "./storage";
export const campaignMediaPath = /^\/api\/campaign-media\/([a-f0-9-]{36})$/i;
export async function checkCampaignMedia(
  url: string | undefined,
  owner: string,
  admin = false,
) {
  const id = url?.match(campaignMediaPath)?.[1];
  if (!id) return;
  const a = await get(id);
  if (
    a?.kind !== "assets" ||
    a.category !== "campaign-cover" ||
    (!admin && a.ownerId !== owner)
  )
    throw Error("본인이 등록한 대표 이미지만 사용할 수 있어요.");
}
export async function saveCampaignImage(owner: string, buffer: Buffer) {
  if (!buffer.length || buffer.length > 3 * 1024 * 1024)
    throw Error("이미지는 3MB 이하로 올려주세요.");
  const image = sharp(buffer, {
    limitInputPixels: 20_000_000,
    animated: false,
  });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
    throw Error("JPG·PNG·WebP 이미지로 올려주세요.");
  const converted = await image
    .rotate()
    .resize(1200, 900, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  return transaction(async () => {
    await lock("campaign-media:" + owner);
    const [count] = await query<{ count: number }>(
      "select count(*)::int count from records where kind='assets' and data->>'category'='campaign-cover' and data->>'ownerId'=$1 and created_at>now()-interval '1 day'",
      [owner],
    );
    if (count.count >= 30)
      throw Error(
        "하루에 이미지를 30장까지 올릴 수 있어요. 내일 다시 시도해주세요.",
      );
    const storageName = randomUUID() + ".webp";
    await putObject(storageName, converted, "image/webp");
    try {
      const a = await create("assets", {
        category: "campaign-cover",
        name: "대표 이미지.webp",
        ownerId: owner,
        storageName,
        mime: "image/webp",
        size: converted.length,
      });
      return { id: a.id, url: "/api/campaign-media/" + a.id };
    } catch (e) {
      await removeObjects([storageName]);
      throw e;
    }
  });
}
export async function campaignImageRecord(
  id: string,
  owner: string | null,
  admin = false,
) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  const a = await get(id);
  if (a?.kind !== "assets" || a.category !== "campaign-cover" || a.deletedAt)
    return null;
  if (admin || a.ownerId === owner) return a;
  const published = await query(
    "select c.id from commerce_campaigns c join commerce_orders o on o.id=c.order_id where c.data->'input'->>'imageUrl'=$1 and o.data->>'status'='paid' and coalesce(c.data->'input'->>'visibility','public')='public' and c.data->>'status' in ('recruiting','selecting','producing','review','completed') limit 1",
    ["/api/campaign-media/" + id],
  );
  return published.length ? a : null;
}
