import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createInterface } from "node:readline/promises";
import { AssistantCodex } from "./lib/assistant-codex";
import { acquireWindowsAssistantLock } from "./lib/assistant-singleton";

const args = process.argv.slice(2),
  mode = args[0];
const option = (key: string) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};
const configPath =
  process.env.ONECATION_ASSISTANT_CONFIG ||
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), ".config"),
    "Onecation",
    "assistant-device.json",
  );
type Config = { url: string; token: string; id: string };
async function http(url: string, body: unknown, token?: string) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json();
  if (!r.ok) {
    const e = new Error(d.error || "서버 연결을 확인해주세요.");
    Object.assign(e, { status: r.status });
    throw e;
  }
  return d;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
if (mode === "pair") {
  const base = option("--url") || "https://www.onemarketing.kr",
    u = new URL(base);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    (u.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(u.hostname))
  )
    throw new Error("HTTPS 원케이션 주소를 확인해주세요.");
  let code = option("--code");
  if (!code) {
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    code = (await input.question("대시보드에서 발급한 연결 코드: ")).trim();
    input.close();
  }
  const data = await http(u.origin + "/api/assistant/pair", {
    code,
    name: option("--name") || os.hostname(),
  });
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify({ url: u.origin, id: data.id, token: data.token }),
    { mode: 0o600 },
  );
  try {
    if (process.platform === "win32") {
      const info = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
        encoding: "utf8",
        windowsHide: true,
      });
      const sid = info.match(/S-1-\d+(?:-\d+)+/)?.[0];
      if (!sid) throw new Error();
      execFileSync(
        "icacls.exe",
        [configPath, "/inheritance:r", "/grant:r", "*" + sid + ":(F)"],
        { stdio: "ignore", windowsHide: true },
      );
    } else chmodSync(configPath, 0o600);
  } catch {
    unlinkSync(configPath);
    throw new Error("연결 파일의 접근 권한을 설정하지 못했어요.");
  }
  console.log("PC 연결 완료. npm run assistant:worker 로 실행해주세요.");
} else if (mode === "worker") {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Config;
  const singleton = await acquireWindowsAssistantLock(configPath);
  if (!singleton) {
    console.log("이미 실행 중인 원케이션 PC 연결 프로그램을 사용해요.");
    process.exit(0);
  }
  if (
    !/^https:\/\//.test(config.url) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(config.url)
  )
    throw new Error("저장된 서버 주소를 확인해주세요.");
  const endpoint = config.url + "/api/assistant/worker";
  const call = (b: unknown) => http(endpoint, b, config.token);
  let codex: AssistantCodex | null = null,
    stopped = false;
  const stop = () => {
    stopped = true;
    codex?.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log("원케이션 PC 연결 프로그램 시작. 종료하려면 Ctrl+C를 누르세요.");
  while (!stopped) {
    try {
      if (codex && !codex.isAlive()) {
        codex.close();
        codex = null;
      }
      if (!codex) {
        const candidate = new AssistantCodex();
        try {
          await candidate.start();
          codex = candidate;
        } catch (e) {
          candidate.close();
          await call({
            action: "heartbeat",
            status:
              e instanceof Error && e.message === "login_required"
                ? "login_required"
                : "error",
          });
          console.log(
            "Codex 로그인 또는 연결을 확인해주세요. 15초 후 다시 확인합니다.",
          );
          await sleep(15000);
          continue;
        }
      }
      await call({ action: "heartbeat", status: "ready" });
      const job = await call({ action: "claim" });
      if (!job) {
        await sleep(3500);
        continue;
      }
      const controller = new AbortController();
      const heartbeat = setInterval(() => {
        void call({
          action: "heartbeat",
          status: "ready",
          id: job.id,
          lease: job.lease,
        })
          .then((r) => {
            if (!r.continue) controller.abort();
          })
          .catch(() => controller.abort());
      }, 10000);
      try {
        const output = await codex.run(
          { message: job.message, history: job.history, context: job.context },
          controller.signal,
        );
        let delivered = false;
        for (let attempt = 0; attempt < 3 && !delivered; attempt++) {
          try {
            await call({
              action: "complete",
              id: job.id,
              lease: job.lease,
              output,
            });
            delivered = true;
          } catch (e) {
            if ((e as any).status === 400 || attempt === 2) throw e;
            await sleep(1500);
          }
        }
      } catch (e) {
        await call({
          action: "fail",
          id: job.id,
          lease: job.lease,
          reason:
            e instanceof Error && e.message === "login_required"
              ? "login_required"
              : "error",
        }).catch(() => {});
        codex.close();
        codex = null;
      } finally {
        clearInterval(heartbeat);
      }
    } catch (e) {
      if ((e as any).status === 401) {
        console.log("PC 연결이 해제됐어요. 대시보드에서 다시 연결해주세요.");
        stop();
        break;
      }
      console.log("서버 연결을 확인하고 있어요.");
      await sleep(8000);
    }
  }
  codex?.close();
  await singleton.release();
} else throw new Error("pair 또는 worker 명령을 사용해주세요.");
