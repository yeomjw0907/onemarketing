import { config } from "dotenv";
import http from "node:http";
import path from "node:path";
import next from "next";
config({ path: ".env.local", quiet: true });
process.env.DATA_DIR = path.join(process.cwd(), ".data", "acceptance");
process.env.APP_URL = "http://127.0.0.1:3108";
const app = next({ dev: false, hostname: "127.0.0.1", port: 3108 });
await app.prepare();
const handler = app.getRequestHandler();
http
  .createServer(handler)
  .listen(3108, "127.0.0.1", () =>
    console.log("Isolated acceptance server: http://127.0.0.1:3108"),
  );
