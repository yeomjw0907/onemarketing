import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
// supabase/migrations/*.sql 을 DATABASE_URL의 DB_SCHEMA(기본 public)에 적용한다.
// 운영 public 스키마는 Supabase MCP/CLI로 같은 파일을 적용한 뒤 이 스크립트로 추적 테이블만 맞출 수도 있다.
const { applyMigrations } = await import("../src/lib/migrate");
const { closeDb, schemaName } = await import("../src/lib/db");
try {
  const applied = await applyMigrations();
  console.log(
    `schema ${schemaName()}: ${applied.length ? "applied " + applied.join(", ") : "already up to date"}`,
  );
} finally {
  await closeDb();
}
