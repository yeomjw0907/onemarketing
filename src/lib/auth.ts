import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
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
export async function actor() {
  const token = (await cookies()).get("om_session")?.value;
  if (!token) return null;
  const row = db
    .prepare("SELECT email FROM sessions WHERE token_hash=? AND expires>?")
    .get(tokenHash(token), Date.now()) as { email: string } | undefined;
  return row?.email || null;
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
export function login(email: string, password: string) {
  const key = tokenHash(email.toLowerCase());
  const now = Date.now();
  const attempts = db
    .prepare("SELECT count,until_time FROM login_attempts WHERE key=?")
    .get(key) as { count: number; until_time: number } | undefined;
  if (attempts && attempts.until_time > now && attempts.count >= 8)
    throw new Error("로그인 시도가 많습니다. 15분 후 다시 시도하세요.");
  const users = JSON.parse(process.env.ADMIN_USERS_JSON || "[]") as {
    email: string;
    hash: string;
  }[];
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !verifyPassword(password, user.hash)) {
    db.prepare(
      "INSERT INTO login_attempts VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until_time=excluded.until_time",
    ).run(
      key,
      attempts && attempts.until_time > now ? attempts.count + 1 : 1,
      now + 15 * 60_000,
    );
    throw new Error("이메일 또는 비밀번호를 확인하세요.");
  }
  db.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
  db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    tokenHash(token),
    user.email,
    now + 12 * 60 * 60_000,
  );
  return token;
}
