import { cookies } from "next/headers";
import { actor, login, logout, sameOrigin } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    { email: await actor() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await request.json();
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.password.length > 256
    )
      throw new Error("로그인 정보를 확인하세요.");
    const token = await login(body.email, body.password);
    (await cookies()).set("om_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "로그인 실패" },
      { status: 401 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const jar = await cookies();
    await logout(jar.get("om_session")?.value);
    jar.delete("om_session");
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  }
}
