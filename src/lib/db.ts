import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { kinds, type Kind, type RecordData, type DatabaseView } from "./types";
// Supabase PostgreSQL 운영 DB. 레코드는 kind별 JSON 문서로 저장하고 version으로 낙관적 충돌을 검사한다.
// 트랜잭션은 AsyncLocalStorage로 현재 클라이언트를 전달하므로 호출부는 get/list/create/update를 그대로 쓴다.
const store = new AsyncLocalStorage<PoolClient>();
let pool: Pool | undefined;
export function schemaName() {
  const schema = process.env.DB_SCHEMA || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("DB_SCHEMA 이름이 올바르지 않습니다.");
  return schema;
}
function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL 설정이 필요합니다. .env.local을 확인하세요.");
  const ssl =
    process.env.DATABASE_SSL === "disable"
      ? false
      : process.env.DATABASE_CA_CERT
        ? { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true }
        : { rejectUnauthorized: false };
  pool = new Pool({
    connectionString: url,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX || 6),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  pool.on("error", () => {});
  const schema = schemaName();
  if (schema !== "public")
    pool.on("connect", (client) => {
      client.query(`set search_path to "${schema}", public`).catch(() => {});
    });
  return pool;
}
// 매개변수가 없으면 simple query로 보내 migration 파일처럼 여러 문장을 한 번에 실행할 수 있게 한다.
function run(text: string, params: unknown[]) {
  const client = store.getStore() || getPool();
  return params.length ? client.query(text, params) : client.query(text);
}
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await run(text, params);
  return result.rows as T[];
}
export async function execute(text: string, params: unknown[] = []) {
  const result = await run(text, params);
  return result.rowCount || 0;
}
let savepoints = 0;
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const current = store.getStore();
  if (current) {
    const name = "sp_" + ++savepoints;
    await current.query(`savepoint ${name}`);
    try {
      const result = await fn();
      await current.query(`release savepoint ${name}`);
      return result;
    } catch (e) {
      await current.query(`rollback to savepoint ${name}`);
      throw e;
    }
  }
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const schema = schemaName();
    if (schema !== "public")
      await client.query(`set local search_path to "${schema}", public`);
    const result = await store.run(client, fn);
    await client.query("commit");
    return result;
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}
export function inTransaction() {
  return Boolean(store.getStore());
}
// 트랜잭션 범위 advisory lock. 같은 이름의 동시 쓰기를 직렬화한다.
export async function lock(name: string) {
  if (!store.getStore())
    throw new Error("lock은 트랜잭션 안에서만 사용합니다.");
  await query("select pg_advisory_xact_lock(hashtext($1))", [name]);
}
export async function closeDb() {
  const p = pool;
  pool = undefined;
  if (p) await p.end();
}
const decode = (row: { data: unknown } | undefined): RecordData | undefined =>
  row
    ? ((typeof row.data === "string"
        ? JSON.parse(row.data)
        : row.data) as RecordData)
    : undefined;
export async function get(id: string) {
  const rows = await query<{ data: unknown }>(
    "select data from records where id=$1",
    [id],
  );
  return decode(rows[0]);
}
export async function list(kind: Kind): Promise<RecordData[]> {
  const rows = await query<{ data: unknown }>(
    "select data from records where kind=$1 order by created_at desc, id",
    [kind],
  );
  return rows.map((r) => decode(r)!);
}
export async function view(): Promise<DatabaseView> {
  const result = Object.fromEntries(
    kinds.map((k) => [k, [] as RecordData[]]),
  ) as unknown as DatabaseView;
  const rows = await query<{ kind: Kind; data: unknown }>(
    "select kind, data from records where kind <> 'job_logs' order by created_at desc, id",
  );
  for (const r of rows) if (result[r.kind]) result[r.kind].push(decode(r)!);
  return result;
}
export async function create(
  kind: Kind,
  data: Record<string, unknown>,
): Promise<RecordData> {
  const now = new Date().toISOString();
  const row = {
    ...data,
    id: randomUUID(),
    kind,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await execute(
    "insert into records (id, kind, version, data, created_at, updated_at) values ($1,$2,$3,$4::jsonb,$5,$6)",
    [row.id, kind, 1, JSON.stringify(row), now, now],
  );
  return row;
}
export async function update(
  id: string,
  patch: Record<string, unknown>,
  version?: number,
): Promise<RecordData> {
  const old = await get(id);
  if (!old) throw new Error("항목을 찾을 수 없습니다.");
  if (version !== undefined && old.version !== version)
    throw new Error("다른 곳에서 수정되었습니다. 새로고침 후 다시 시도하세요.");
  const row = {
    ...old,
    ...patch,
    id: old.id,
    kind: old.kind,
    createdAt: old.createdAt,
    updatedAt: new Date().toISOString(),
    version: old.version + 1,
  };
  const changes = await execute(
    "update records set data=$1::jsonb, version=$2, updated_at=$3 where id=$4 and version=$5",
    [JSON.stringify(row), row.version, row.updatedAt, id, old.version],
  );
  if (!changes) throw new Error("변경 충돌이 발생했습니다.");
  return row;
}
export function audit(
  actor: string,
  action: string,
  targetId: string,
  detail: unknown = {},
) {
  return create("events", { actor, action, targetId, detail });
}
// 명령 중복 방지. 같은 key는 처음 결과를 반환하고, 동시 요청은 advisory lock으로 직렬화한다.
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return transaction(async () => {
    await lock("command:" + key);
    const old = await query<{ result: unknown }>(
      "select result from commands where key=$1",
      [key],
    );
    if (old.length) return old[0].result as T;
    const result = await fn();
    await execute("insert into commands (key, result) values ($1, $2::jsonb)", [
      key,
      JSON.stringify(result ?? null),
    ]);
    return result;
  });
}
