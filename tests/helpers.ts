import { config } from "dotenv";
import { after } from "node:test";
import { randomUUID } from "node:crypto";
// 테스트는 운영과 같은 Supabase 프로젝트의 일회용 스키마(test_xxx)와 Storage 접두어(test_xxx/)를 사용하고 끝나면 삭제한다.
// TEST_DATABASE_URL이 있으면 그 DB를 쓴다. 운영 public 스키마와 운영 파일에는 닿지 않는다.
config({ path: ".env.local", quiet: true });
const run = "test_" + randomUUID().replace(/-/g, "").slice(0, 12);
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.DATABASE_URL)
  throw new Error(
    "테스트에는 DATABASE_URL(또는 TEST_DATABASE_URL)과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다. .env.local을 확인하세요.",
  );
process.env.DB_SCHEMA = run;
process.env.SUPABASE_STORAGE_PREFIX = run + "/";
process.env.JOB_RUNNER = "worker";
process.env.NAVER_KEYWORD_METRICS_ENABLED = "false";
delete process.env.CRON_SECRET;
const { applyMigrations, dropSchema } = await import("../src/lib/migrate");
const { closeDb } = await import("../src/lib/db");
const { listObjects, removeObjects } = await import("../src/lib/storage");
export const testSchema = run;
// 정리 훅은 migration 적용 전에 등록해 적용이 실패해도 스키마를 남기지 않는다.
after(async () => {
  try {
    const names = await listObjects();
    if (names.length) await removeObjects(names);
  } catch (e) {
    console.warn(
      "storage cleanup skipped:",
      e instanceof Error ? e.message : e,
    );
  }
  await dropSchema();
  await closeDb();
});
await applyMigrations();
