import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { execute, query, transaction } from "./db";
export const tokenHash = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  try {
    const [salt, value] = hash.split(":");
    const a = Buffer.from(value, "hex"),
      b = scryptSync(password, salt, 64);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
export async function sessionEmail(token: string | undefined) {
  if (!token) return null;
  const rows = await query<{ email: string }>(
    "select email from sessions where token_hash=$1 and expires>$2",
    [tokenHash(token), Date.now()],
  );
  return rows[0]?.email || null;
}
export async function actor() {
  return sessionEmail((await cookies()).get("om_session")?.value);
}
export async function requireActor() {
  const email = await actor();
  if (!email) throw new Error("로그인이 필요합니다.");
  return email;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (!origin || origin !== expected)
    throw new Error("허용되지 않은 요청입니다.");
}
// 관리자 계정은 환경변수의 scrypt 해시로 확인하고, 세션·시도 제한은 공유 DB에 저장한다.
// 실패 기록은 트랜잭션 밖에서 남겨 오류로 되돌아가지 않게 한다.
export async function login(email: string, password: string) {
  const key = tokenHash(email.toLowerCase());
  const now = Date.now();
  const attempts = (
    await query<{ count: number; until_time: string | number }>(
      "select count, until_time from login_attempts where key=$1",
      [key],
    )
  )[0];
  const blocked = attempts && Number(attempts.until_time) > now;
  if (blocked && Number(attempts.count) >= 8)
    throw new Error("로그인 시도가 많습니다. 15분 후 다시 시도하세요.");
  const users = JSON.parse(process.env.ADMIN_USERS_JSON || "[]") as {
    email: string;
    hash: string;
  }[];
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !verifyPassword(password, user.hash)) {
    await execute(
      "insert into login_attempts (key, count, until_time) values ($1,$2,$3) on conflict (key) do update set count=excluded.count, until_time=excluded.until_time",
      [key, blocked ? Number(attempts.count) + 1 : 1, now + 15 * 60_000],
    );
    throw new Error("이메일 또는 비밀번호를 확인하세요.");
  }
  const token = randomBytes(32).toString("hex");
  await transaction(async () => {
    await execute("delete from login_attempts where key=$1", [key]);
    await execute("delete from sessions where expires<$1", [now]);
    await execute(
      "insert into sessions (token_hash, email, expires) values ($1,$2,$3)",
      [tokenHash(token), user.email, now + 12 * 60 * 60_000],
    );
  });
  return token;
}
export async function logout(token: string | undefined) {
  if (token)
    await execute("delete from sessions where token_hash=$1", [
      tokenHash(token),
    ]);
}
