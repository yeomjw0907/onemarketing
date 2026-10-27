import { requireActor, sameOrigin } from "@/lib/auth";
import { provisionCustomerAccount } from "@/lib/customer-account";
import { query } from "@/lib/db";
import { z, ZodError } from "zod";
export async function GET(request: Request) {
  try {
    await requireActor();
    const id = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("customerId"));
    const accounts = await query(
      "select id,email,name,phone from advertiser_accounts where customer_id=$1",
      [id],
    );
    return Response.json(
      { accounts },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "조회 권한과 고객 정보를 확인해주세요." },
      { status: 403 },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await requireActor();
    const raw = await request.text();
    if (raw.length > 4000) throw new Error("요청이 너무 깁니다.");
    return Response.json(
      await provisionCustomerAccount(JSON.parse(raw), actor),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ZodError
            ? e.issues[0]?.message
            : e instanceof Error
              ? e.message
              : "계정을 발급하지 못했습니다.",
      },
      { status: 400 },
    );
  }
}
