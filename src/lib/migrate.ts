import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execute, query, schemaName, transaction } from "./db";
// supabase/migrations/*.sql 을 순서대로 적용한다. 운영(public)은 Supabase MCP/CLI로 적용한 이력과 같은 파일을 쓰고,
// 테스트·인수 검증 스키마는 이 함수로 같은 파일을 적용해 스키마 차이를 없앤다.
export const migrationsDir = path.resolve(
  /* turbopackIgnore: true */ process.env.MIGRATIONS_DIR ||
    "supabase/migrations",
);
export function migrationFiles() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}
export async function applyMigrations() {
  const schema = schemaName();
  if (schema !== "public")
    await execute(`create schema if not exists "${schema}"`);
  await execute(
    "create table if not exists app_schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (
      await query<{ name: string }>("select name from app_schema_migrations")
    ).map((r) => r.name),
  );
  const done: string[] = [];
  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    await transaction(async () => {
      await execute(sql);
      await execute("insert into app_schema_migrations (name) values ($1)", [
        file,
      ]);
    });
    done.push(file);
  }
  return done;
}
export async function dropSchema() {
  const schema = schemaName();
  if (schema === "public")
    throw new Error("public 스키마는 삭제하지 않습니다.");
  await execute(`drop schema if exists "${schema}" cascade`);
}
