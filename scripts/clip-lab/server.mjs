import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  atomicJson,
  listRuns,
  summarize,
  youtubeUrl,
  runBatch,
} from "./core.mjs";
import { enrichMetadata } from "./metadata.mjs";
import {
  listResearch,
  researchForLab,
  buildKnowledge,
  researchAccounting,
} from "./knowledge.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export async function startLab({
  root,
  key,
  model = "gemini-3.1-flash-lite",
  port = 4317,
}) {
  await mkdir(root, { recursive: true });
  let active = false;
  let cancelled = false;
  let mutation = Promise.resolve();
  const serial = (fn) => {
    const p = mutation.then(fn);
    mutation = p.catch(() => {});
    return p;
  };
  const loadManifest = async () => {
    try {
      return JSON.parse(
        await readFile(path.join(root, "manifest.json"), "utf8"),
      );
    } catch (e) {
      if (e.code === "ENOENT")
        return { name: "클립 퀄리티 고도화 대작전!연구소", references: [] };
      throw e;
    }
  };
  const state = async () => {
    const research = await listResearch(root);
    const runs = [...(await listRuns(root)), ...research.map(researchForLab)];
    return {
      manifest: await loadManifest(),
      runs,
      summary: {
        ...summarize(runs),
        ...(research.length ? await researchAccounting(root, research) : {}),
      },
      active,
      canAnalyze: !!key && !research.length,
      knowledge: research.length ? buildKnowledge(research) : null,
      model,
    };
  };
  const json = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  const body = async (req) => {
    let raw = "";
    for await (const c of req) {
      raw += c;
      if (Buffer.byteLength(raw) > 65536)
        throw new Error("입력이 너무 큽니다.");
    }
    return JSON.parse(raw);
  };
  const server = http.createServer(async (req, res) => {
    try {
      // Loopback-only, exact Host and Origin checks prevent cross-site local API calls.
      const expected = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expected)
        return json(res, 403, { error: "허용되지 않은 호스트입니다." });
      if (req.headers.origin && req.headers.origin !== `http://${expected}`)
        return json(res, 403, { error: "허용되지 않은 출처입니다." });
      const url = new URL(req.url, `http://${expected}`);
      if (req.method === "GET" && url.pathname === "/api/state")
        return json(res, 200, await state());
      if (req.method === "POST") {
        if (
          req.headers.origin !== `http://${expected}` ||
          !req.headers["content-type"]?.startsWith("application/json")
        )
          return json(res, 403, { error: "같은 화면에서 요청하세요." });
        if (url.pathname === "/api/references")
          return await serial(async () => {
            if (active)
              return json(res, 409, { error: "분석 종료 후 등록하세요." });
            const b = await body(req);
            if (
              !Array.isArray(b.references) ||
              b.references.length < 1 ||
              b.references.length > 30
            )
              throw new Error("1~30개를 입력하세요.");
            const m = await loadManifest();
            const refs = new Map(
              m.references.map((r) => [youtubeUrl(r.url), r]),
            );
            for (const r of b.references) {
              const u = youtubeUrl(r.url);
              if (!refs.has(u))
                refs.set(u, {
                  url: u,
                  title: String(r.title || u).slice(0, 300),
                  category: String(r.category || "미분류").slice(0, 40),
                  discoverySource: null,
                });
            }
            if (refs.size > 30)
              throw new Error(
                "이 실험의 한도는 영상 30개입니다. 새 실험은 다른 데이터 폴더에서 시작하세요.",
              );
            m.references = [...refs.values()];
            await atomicJson(path.join(root, "manifest.json"), m);
            return json(res, 200, { count: refs.size });
          });
        if (url.pathname === "/api/batch" || url.pathname === "/api/retry503") {
          if ((await listResearch(root)).length)
            return json(res, 409, {
              error:
                "대규모 연구는 clip-lab:research 명령으로 이어서 실행하세요. 기존 기록을 다시 제출하지 않습니다.",
            });
          if (active) return json(res, 409, { error: "이미 분석 중입니다." });
          if (!key)
            return json(res, 409, {
              error:
                "이 서버에는 Gemini 키가 없어 결과 열람과 검토만 가능합니다.",
            });
          active = true;
          cancelled = false;
          const retryRejected = url.pathname === "/api/retry503";
          // One task at a time; every run persists before submitting. Existing records are reused.
          void (async () => {
            try {
              const m = await enrichMetadata({
                root,
                manifest: await loadManifest(),
              });
              for (const reference of m.references) {
                if (cancelled) break;
                await runBatch({
                  references: [reference],
                  key,
                  model,
                  root,
                  retryRejected,
                });
              }
            } catch {
              await atomicJson(path.join(root, "batch-error.json"), {
                at: new Date().toISOString(),
                message: "분석 실행 오류. 영상별 기록을 확인하세요.",
              });
            } finally {
              active = false;
            }
          })();
          return json(res, 202, { started: true });
        }
        if (url.pathname === "/api/cancel") {
          cancelled = true;
          return json(res, 200, {
            message: "현재 요청 이후의 실행을 중지합니다.",
          });
        }
        if (url.pathname === "/api/review")
          return await serial(async () => {
            const b = await body(req);
            if (
              !/^[a-f0-9]{64}$/.test(b.id) ||
              !["unreviewed", "source-checked", "rejected"].includes(
                b.status,
              ) ||
              !Number.isInteger(b.version)
            )
              throw new Error("검토 입력 오류");
            let file = path.join(root, "runs", b.id + ".json");
            try {
              await readFile(file);
            } catch (e) {
              if (e.code !== "ENOENT") throw e;
              file = path.join(root, "research", b.id + ".json");
            }
            const r = JSON.parse(await readFile(file, "utf8"));
            r.reviewVersion ??= 1;
            if (r.status !== "succeeded")
              throw new Error("분석 완료 영상만 검토할 수 있습니다.");
            if (r.reviewVersion !== b.version)
              return json(res, 409, {
                error: "검토 기록이 변경되었습니다. 새로고침하세요.",
              });
            const note = String(b.note || "").trim();
            if (!note || note.length > 3000)
              throw new Error(
                "대조한 구간이나 반려 사유를 1~3000자로 남겨주세요.",
              );
            const reviewedAt = new Date().toISOString();
            r.reviewHistory = [
              ...(r.reviewHistory || []),
              {
                status: b.status,
                note,
                at: reviewedAt,
                version: r.reviewVersion + 1,
              },
            ];
            Object.assign(r, {
              reviewStatus: b.status,
              reviewNote: note,
              reviewVersion: r.reviewVersion + 1,
              reviewedAt,
            });
            await atomicJson(file, r);
            return json(res, 200, { saved: true });
          });
        return json(res, 404, { error: "경로를 찾을 수 없습니다." });
      }
      if (
        req.method === "GET" &&
        ["/", "/app.js", "/style.css"].includes(url.pathname)
      ) {
        const name =
          url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        res.writeHead(200, {
          "content-type": name.endsWith("html")
            ? "text/html; charset=utf-8"
            : name.endsWith("js")
              ? "text/javascript; charset=utf-8"
              : "text/css; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy":
            "default-src 'self'; frame-src https://www.youtube.com; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        });
        return res.end(await readFile(path.join(here, "ui", name)));
      }
      json(res, 404, { error: "경로를 찾을 수 없습니다." });
    } catch {
      if (!res.headersSent)
        json(res, 400, {
          error: "요청을 처리하지 못했습니다. 입력과 실행 상태를 확인하세요.",
        });
      else res.end();
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.env.GEMINI_ENV_FILE)
    process.loadEnvFile(process.env.GEMINI_ENV_FILE);
  const app = await startLab({
    root: path.resolve(process.env.CLIP_LAB_DATA_DIR || "output/clip-lab"),
    key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_VIDEO_ANALYSIS_MODEL || "gemini-3.1-flash-lite",
    port: Number(process.env.CLIP_LAB_PORT || 4317),
  });
  console.log("클립 연구소: " + app.url);
}
