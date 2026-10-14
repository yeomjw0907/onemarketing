import { config } from "dotenv";
import http from "node:http";
import next from "next";
config({ path: ".env.local", quiet: true });
// 운영 데이터와 분리된 인수 검증 서버. 같은 Supabase 프로젝트의 acceptance 스키마와 Storage acceptance/ 접두어를 사용한다.
// 먼저 npm run build 를 실행한다. npm run smoke 는 SMOKE_URL=http://127.0.0.1:3108 로 이 서버를 사용한다.
process.env.DB_SCHEMA = process.env.ACCEPTANCE_SCHEMA || "acceptance";
process.env.SUPABASE_STORAGE_PREFIX = process.env.DB_SCHEMA + "/";
process.env.APP_URL = "http://127.0.0.1:3108";
process.env.JOB_RUNNER = process.env.JOB_RUNNER || "serverless";
const { applyMigrations } = await import("../src/lib/migrate");
await applyMigrations();
const app = next({ dev: false, hostname: "127.0.0.1", port: 3108 });
await app.prepare();
const handler = app.getRequestHandler();
http
  .createServer(handler)
  .listen(3108, "127.0.0.1", () =>
    console.log(
      `Isolated acceptance server: http://127.0.0.1:3108 (schema ${process.env.DB_SCHEMA})`,
    ),
  );
