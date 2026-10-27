import { randomBytes, createHash } from "node:crypto";
import { list, create, update, lock, transaction, query, execute } from "./db";
import { advertiserAuth, type Advertiser } from "./market";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function advertiserKakaoPending(identity: string) {
  if (!/^[a-f0-9]{64}$/.test(identity))
    throw new Error("카카오 로그인을 다시 진행해주세요.");
  const [result] = await query<{ data: Record<string, any> }>(
    "select data from records where kind='portal_links' and data->>'purpose'='advertiser-kakao-login' and data->>'tokenHash'=$1 limit 1",
    [hash(identity)],
  );
  const row = result?.data;
  if (
    !row ||
    row.usedAt ||
    row.revokedAt ||
    Date.parse(String(row.expiresAt)) <= Date.now()
  )
    throw new Error("카카오 로그인을 다시 진행해주세요.");
  return row;
}
export async function advertiserKakaoLogin(
  identity: string,
  input?: unknown,
  ip = "unknown",
) {
  const body = input as Record<string, unknown> | undefined;
  // Login failures must commit their rate-limit counters outside the binding transaction.
  if (body?.action === "social-link") await advertiserKakaoPending(identity);
  const existingLogin =
    body?.action === "social-link"
      ? await advertiserAuth(
          { action: "login", email: body.email, password: body.password },
          ip,
        )
      : null;
  return transaction(async () => {
    await lock("advertiser-kakao-identity:" + hash(identity));
    const pending = await advertiserKakaoPending(identity);
    await lock("advertiser-kakao:" + pending.kakaoId);
    const binding = (await list("portal_links")).find(
      (r) =>
        r.purpose === "advertiser-kakao-account" &&
        r.kakaoId === pending.kakaoId &&
        !r.revokedAt,
    );
    if (!binding && !input) return null;
    let result;
    if (binding) {
      const [account] = await query<Advertiser>(
        "select id,email,name,phone,customer_id from advertiser_accounts where id=$1",
        [binding.advertiserId],
      );
      if (!account) throw new Error("광고주 계정을 확인해주세요.");
      const token = randomBytes(32).toString("hex");
      await execute(
        "insert into advertiser_sessions(token_hash,advertiser_id,expires_at) values($1,$2,now()+interval '7 days')",
        [hash(token), account.id],
      );
      result = { token, account };
    } else {
      // Email is contact information only; never merge accounts using an unverified email.
      result =
        existingLogin ??
        (await advertiserAuth(
          {
            ...body,
            action: "register",
            password: randomBytes(48).toString("hex"),
          },
          ip,
        ));
      const accountId = result.account.id;
      await lock("advertiser-kakao-owner:" + accountId);
      if (
        (await list("portal_links")).some(
          (r) =>
            r.purpose === "advertiser-kakao-account" &&
            r.advertiserId === accountId &&
            !r.revokedAt,
        )
      )
        throw new Error("이미 다른 카카오 계정이 연결된 광고주입니다.");
      await create("portal_links", {
        purpose: "advertiser-kakao-account",
        kakaoId: pending.kakaoId,
        advertiserId: result.account.id,
      });
    }
    await update(pending.id, { usedAt: new Date().toISOString() });
    return result;
  });
}
