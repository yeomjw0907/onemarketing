import { cookies } from "next/headers";
import { sameOrigin } from "@/lib/auth";
import {
  advertiserAuth,
  advertiserLogout,
  advertiserSession,
} from "@/lib/market";
import { ZodError } from "zod";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    {
      account: await advertiserSession(
        (await cookies()).get("om_advertiser")?.value,
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const raw = await request.text();
    if (raw.length > 4000) throw new Error("요청이 너무 깁니다.");
    const b = JSON.parse(raw);
    const jar = await cookies();
    if (b.action === "logout") {
      await advertiserLogout(jar.get("om_advertiser")?.value);
      jar.delete("om_advertiser");
      return Response.json({ ok: true });
    }
    const result = await advertiserAuth(
      b,
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown",
    );
    jar.set("om_advertiser", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        new URL(request.url).protocol === "https:" ||
        process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 7 * 86400,
    });
    return Response.json({ account: result.account });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ZodError
            ? e.issues[0]?.message
            : e instanceof Error
              ? e.message
              : "로그인하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
