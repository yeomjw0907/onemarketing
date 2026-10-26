import { cookies } from "next/headers";
import { actor } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { campaignImageRecord } from "@/lib/campaign-media";
import { getObject } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const a = await advertiserSession(
      (await cookies()).get("om_advertiser")?.value,
    );
    const image = await campaignImageRecord(
      id,
      a?.id || null,
      Boolean(await actor()),
    );
    if (!image)
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    return new Response(
      new Uint8Array(await getObject(String(image.storageName))),
      {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
