import { randomUUID } from "node:crypto";
import { z } from "zod";
import { passwordHash } from "./auth";
import { get, query, execute, transaction, lock, audit } from "./db";
export async function provisionCustomerAccount(input: unknown, actor: string) {
  const b = z
    .object({
      customerId: z.string().uuid(),
      email: z
        .string()
        .trim()
        .email()
        .max(254)
        .transform((v) => v.toLowerCase()),
      password: z
        .string()
        .min(10, "초기 비밀번호는 10자 이상 입력해주세요.")
        .max(128),
      name: z.string().trim().min(1).max(200),
      phone: z
        .string()
        .transform((v) => v.replace(/\D/g, ""))
        .refine((v) => /^01\d{8,9}$/.test(v), "휴대전화 번호를 확인해주세요."),
    })
    .parse(input);
  return transaction(async () => {
    await lock("advertiser-email:" + b.email);
    await lock("advertiser-customer:" + b.customerId);
    const customer = await get(b.customerId);
    if (customer?.kind !== "customers" || customer.deletedAt)
      throw new Error("사용 가능한 고객을 선택해주세요.");
    if (
      (
        await query(
          "select id from advertiser_accounts where email=$1 or customer_id=$2",
          [b.email, b.customerId],
        )
      ).length
    )
      throw new Error("이미 사용 중인 이메일이거나 계정이 발급된 고객입니다.");
    const id = randomUUID();
    await execute(
      "insert into advertiser_accounts(id,email,password_hash,name,phone,customer_id) values($1,$2,$3,$4,$5,$6)",
      [id, b.email, passwordHash(b.password), b.name, b.phone, b.customerId],
    );
    await audit(actor, "advertiser-account-provisioned", b.customerId, {
      advertiserId: id,
      email: b.email,
    });
    return { id, email: b.email };
  });
}
