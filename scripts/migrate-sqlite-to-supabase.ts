import { config } from "dotenv";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, cpSync } from "node:fs";
import path from "node:path";
config({ path: ".env.local", quiet: true });
// 기존 SQLite(.data/marketing.sqlite)와 로컬 파일(.data/files)을 Supabase PostgreSQL·비공개 Storage로 이전한다.
// - 재실행 안전: 레코드는 ON CONFLICT DO NOTHING, 파일은 이미 있으면 건너뛴다. 기존 행을 덮어쓰지 않는다.
// - 원본은 삭제하지 않는다. 실행 전 .data/backups/<시각>/ 에 백업 복사본을 만든다.
// - .data/acceptance 같은 테스트 데이터는 --allow-test-data 없이는 거부한다.
const args = new Set(process.argv.slice(2));
const source = path.resolve(
  process.argv.find((a) => a.startsWith("--source="))?.slice(9) ||
    process.env.DATA_DIR ||
    ".data",
);
if (/acceptance|test/i.test(source) && !args.has("--allow-test-data"))
  throw new Error(
    `${source} 는 테스트 데이터 경로로 보입니다. 운영 DB에 이전하지 않습니다. 필요하면 --allow-test-data 를 지정하세요.`,
  );
const sqlitePath = path.join(source, "marketing.sqlite");
if (!existsSync(sqlitePath)) throw new Error(`${sqlitePath} 가 없습니다.`);
if (!args.has("--no-backup")) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(source, "backups", stamp);
  mkdirSync(backup, { recursive: true });
  await new Database(sqlitePath, { readonly: true }).backup(
    path.join(backup, "marketing.sqlite"),
  );
  if (existsSync(path.join(source, "files")))
    cpSync(path.join(source, "files"), path.join(backup, "files"), {
      recursive: true,
    });
  console.log(`backup: ${backup}`);
}
const { execute, query, transaction, closeDb, schemaName } =
  await import("../src/lib/db");
const { putObject, objectExists, bucketIsPrivate } =
  await import("../src/lib/storage");
const sqlite = new Database(sqlitePath, { readonly: true });
type Row = {
  id: string;
  kind: string;
  version: number;
  data: string;
  created_at: string;
  updated_at: string;
};
const records = sqlite
  .prepare("select * from records order by created_at, id")
  .all() as Row[];
const summary = {
  schema: schemaName(),
  records: { total: records.length, inserted: 0, existing: 0, mismatch: 0 },
  files: { total: 0, uploaded: 0, existing: 0, missing: 0, hashMismatch: 0 },
  sessions: 0,
  loginAttempts: 0,
  commands: 0,
};
try {
  if (!(await bucketIsPrivate()))
    throw new Error("Storage 버킷이 비공개가 아닙니다. 이전을 중단합니다.");
  // 1) 파일 먼저 올린다. 파일이 없는 자산 레코드를 먼저 만들지 않는다.
  const assets = records
    .filter((r) => r.kind === "assets")
    .map((r) => JSON.parse(r.data) as Record<string, unknown>);
  summary.files.total = assets.length;
  for (const a of assets) {
    const storageName = String(a.storageName);
    const local = path.join(source, "files", storageName);
    if (!existsSync(local)) {
      summary.files.missing++;
      console.warn(`missing file for asset ${a.id}: ${storageName}`);
      continue;
    }
    const buffer = readFileSync(local);
    if (createHash("sha256").update(buffer).digest("hex") !== a.hash) {
      summary.files.hashMismatch++;
      console.warn(`hash mismatch for asset ${a.id}: ${storageName}`);
    }
    if (await objectExists(storageName)) {
      summary.files.existing++;
      continue;
    }
    await putObject(storageName, buffer, String(a.mime));
    summary.files.uploaded++;
  }
  if (summary.files.missing && !args.has("--allow-missing-files"))
    throw new Error(
      "원본 파일이 없는 자산이 있습니다. 확인 후 --allow-missing-files 로 레코드만 이전할 수 있습니다.",
    );
  // 2) 레코드·세션·시도 제한·명령 키를 한 트랜잭션으로 이전한다.
  await transaction(async () => {
    for (const r of records) {
      const inserted = await execute(
        "insert into records (id, kind, version, data, created_at, updated_at) values ($1,$2,$3,$4::jsonb,$5,$6) on conflict (id) do nothing",
        [r.id, r.kind, r.version, r.data, r.created_at, r.updated_at],
      );
      if (inserted) {
        summary.records.inserted++;
        continue;
      }
      summary.records.existing++;
      const existing = (
        await query<{ version: number }>(
          "select version from records where id=$1",
          [r.id],
        )
      )[0];
      if (existing && existing.version !== r.version) {
        summary.records.mismatch++;
        console.warn(
          `record ${r.id} exists with version ${existing.version} (sqlite ${r.version}); kept the database row`,
        );
      }
    }
    const now = Date.now();
    for (const s of sqlite
      .prepare("select * from sessions where expires > ?")
      .all(now) as { token_hash: string; email: string; expires: number }[])
      summary.sessions += await execute(
        "insert into sessions (token_hash, email, expires) values ($1,$2,$3) on conflict do nothing",
        [s.token_hash, s.email, s.expires],
      );
    for (const l of sqlite
      .prepare("select * from login_attempts where until_time > ?")
      .all(now) as { key: string; count: number; until_time: number }[])
      summary.loginAttempts += await execute(
        "insert into login_attempts (key, count, until_time) values ($1,$2,$3) on conflict do nothing",
        [l.key, l.count, l.until_time],
      );
    for (const c of sqlite.prepare("select * from commands").all() as {
      key: string;
      result: string;
    }[])
      summary.commands += await execute(
        "insert into commands (key, result) values ($1,$2::jsonb) on conflict do nothing",
        [c.key, c.result],
      );
  });
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    "원본 SQLite와 파일은 삭제하지 않았습니다. 앱 검증 후 보관 정책에 따라 처리하세요.",
  );
} finally {
  sqlite.close();
  await closeDb();
}
