import { timingSafeEqual } from "node:crypto";
import { unlinkKakao } from "@/lib/kakao-auth";
export async function POST(request: Request) {
  const key = process.env.KAKAO_WEBHOOK_ADMIN_KEY,
    header = request.headers.get("authorization") || "";
  if (
    !key ||
    header.length !== ("KakaoAK " + key).length ||
    !timingSafeEqual(Buffer.from(header), Buffer.from("KakaoAK " + key))
  )
    return new Response(null, { status: 401 });
  const b = new URLSearchParams(await request.text());
  if (
    b.get("app_id") !== process.env.KAKAO_APP_ID ||
    !/^[1-9]\d*$/.test(b.get("user_id") || "")
  )
    return new Response(null, { status: 400 });
  try {
    await unlinkKakao(b.get("user_id")!);
  } catch {
    console.error("Kakao unlink processing failed");
  }
  return new Response(null, { status: 200 });
}
