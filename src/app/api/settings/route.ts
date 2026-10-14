import { requireActor } from "@/lib/auth";
export async function GET() {
  try {
    await requireActor();
    return Response.json(
      {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        higgsfield: !!(
          process.env.HIGGSFIELD_API_KEY_ID &&
          process.env.HIGGSFIELD_API_KEY_SECRET
        ),
        defaultEstimates: {
          research: Number(process.env.ESTIMATE_RESEARCH_KRW || 3000),
          copy: Number(process.env.ESTIMATE_COPY_KRW || 500),
          image: Number(process.env.ESTIMATE_IMAGE_KRW || 2000),
          video: Number(process.env.ESTIMATE_VIDEO_KRW || 15000),
          slideshow: 1,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
}
