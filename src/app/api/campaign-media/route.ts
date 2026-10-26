import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import { advertiserSession } from "@/lib/market";
import { saveCampaignImage } from "@/lib/campaign-media";
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await advertiserSession(
      (await cookies()).get("om_advertiser")?.value,
    );
    if (!a)
      return Response.json(
        { error: "광고주 로그인 후 이미지를 올려주세요." },
        { status: 401 },
      );
    if (Number(req.headers.get("content-length")) > 3.2 * 1024 * 1024)
      throw Error("이미지는 3MB 이하로 올려주세요.");
    const form = await req.formData(),
      file = form.get("file");
    if (!(file instanceof File)) throw Error("이미지를 선택해주세요.");
    return Response.json(
      await saveCampaignImage(a.id, Buffer.from(await file.arrayBuffer())),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "이미지를 올리지 못했어요. JPG·PNG·WebP 형식과 3MB 이하 용량을 확인해주세요.",
      },
      { status: 400 },
    );
  }
}
