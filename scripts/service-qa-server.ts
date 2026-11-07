import { config } from "dotenv";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
config({ path: ".env.local", quiet: true });
Object.assign(globalThis, { AsyncLocalStorage });
process.env.DB_SCHEMA =
  "lifecycle_" + randomUUID().replaceAll("-", "").slice(0, 12);
process.env.SUPABASE_STORAGE_PREFIX = process.env.DB_SCHEMA + "/";
process.env.APP_URL = "http://127.0.0.1:3137";
process.env.COOKIE_SECURE = "false";
process.env.JOB_RUNNER = "worker";
process.env.SENS_ENABLED = "false";
process.env.SENS_SMS_ENABLED = "false";
process.env.SENS_BRAND_ENABLED = "false";
process.env.SENS_RECRUITMENT_ENABLED = "false";
const { applyMigrations, dropSchema } = await import("../src/lib/migrate");
const { execute, create, closeDb } = await import("../src/lib/db");
const { passwordHash } = await import("../src/lib/auth");
await applyMigrations();
const password = randomBytes(20).toString("hex");
const email = "lifecycle-admin@qa.local";
process.env.ADMIN_USERS_JSON = JSON.stringify([
  { email, hash: passwordHash(password) },
]);
const participant = await create("participants", {
  name: "격리 QA 참여자",
  phone: "01010000137",
  status: "active",
  payment: { method: "kakaopay" },
  accounts: [
    {
      id: randomUUID(),
      channel: "blog",
      url: "https://blog.naver.com/lifecycle-qa",
      approvalStatus: "approved",
      ownershipVerifiedAt: new Date().toISOString(),
    },
  ],
});
const parent = await create("portal_links", {
  participantId: participant.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const token = randomBytes(32).toString("hex");
await create("portal_links", {
  purpose: "session",
  parentId: parent.id,
  participantId: participant.id,
  tokenHash: createHash("sha256").update(token).digest("hex"),
  verifiedPhone: participant.phone,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
await execute(
  "insert into sessions(token_hash,email,expires) values($1,$2,$3)",
  [
    createHash("sha256").update(password).digest("hex"),
    email,
    Date.now() + 86400000,
  ],
);
await mkdir("output/service-qa", { recursive: true });
await writeFile(
  "output/service-qa/session.json",
  JSON.stringify({
    base: process.env.APP_URL,
    schema: process.env.DB_SCHEMA,
    email,
    password,
    adminToken: password,
    participantToken: token,
    participantId: participant.id,
  }),
);
const { default: next } = await import("next");
const app = next({ dev: true, hostname: "127.0.0.1", port: 3137 });
await app.prepare();
const server = http.createServer(app.getRequestHandler());
server.listen(3137, "127.0.0.1", () =>
  console.log("Isolated service QA ready at " + process.env.APP_URL),
);
let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close();
  await app.close();
  const { listObjects, removeObjects } = await import("../src/lib/storage");
  const files = await listObjects();
  if (files.length) await removeObjects(files);
  await dropSchema();
  await closeDb();
  process.exit(0);
}
process.once("SIGINT", () => void cleanup());
process.once("SIGTERM", () => void cleanup());
