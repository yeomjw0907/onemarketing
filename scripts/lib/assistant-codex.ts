import {
  spawn,
  execFileSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  assistantInstructions,
  assistantOutputJsonSchema,
  assistantOutputSchema,
} from "../../src/lib/assistant-schema";

export function codexCommand() {
  if (process.env.ONECATION_CODEX_BIN) {
    const file = path.resolve(process.env.ONECATION_CODEX_BIN);
    if (!existsSync(file) || ![".exe", ".js"].includes(path.extname(file)))
      throw new Error(
        "ONECATION_CODEX_BIN에는 Codex 실행 파일을 지정해주세요.",
      );
    return path.extname(file) === ".js"
      ? { file: process.execPath, args: [file] }
      : { file, args: [] };
  }
  const projectCli = fileURLToPath(
    new URL("../../node_modules/@openai/codex/bin/codex.js", import.meta.url),
  );
  if (existsSync(projectCli))
    return { file: process.execPath, args: [projectCli] };
  const roots = [
    path.dirname(process.execPath),
    ...String(process.env.PATH || "").split(path.delimiter),
  ];
  for (const root of roots) {
    const cli = path.join(
      root,
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    if (existsSync(cli)) return { file: process.execPath, args: [cli] };
  }
  if (process.platform !== "win32") return { file: "codex", args: [] };
  throw new Error(
    "Codex CLI가 필요해요. PC에서 Codex 설치와 로그인을 확인해주세요.",
  );
}
export function codexEnvironment() {
  const keys = [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "USERNAME",
    "USERDOMAIN",
    "HOME",
    "CODEX_HOME",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ];
  return Object.fromEntries(
    keys.filter((k) => process.env[k]).map((k) => [k, process.env[k]!]),
  ) as NodeJS.ProcessEnv;
}
export function restrictedCodexArgs(names: string[]) {
  if (names.some((n) => !/^[-a-zA-Z0-9_]+$/.test(n)))
    throw new Error("지원하지 않는 MCP 설정 이름이 있어요.");
  return [
    "app-server",
    "-c",
    "features.shell_tool=false",
    "-c",
    "features.apply_patch_freeform=false",
    "-c",
    "features.multi_agent=false",
    "-c",
    "features.apps=false",
    "-c",
    "tools.view_image=false",
    "-c",
    'web_search="disabled"',
    "-c",
    'model_reasoning_effort="low"',
    ...names.flatMap((n) => ["-c", `mcp_servers.${n}.enabled=false`]),
  ];
}
type Pending = {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export class AssistantCodex {
  private model: string | undefined;
  private effort: string | undefined;
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(v: any) => void>();
  private workspace = path.join(
    process.env.LOCALAPPDATA || os.tmpdir(),
    "Onecation",
    "assistant-empty-workspace",
  );
  async start() {
    const cmd = codexCommand(),
      env = codexEnvironment();
    const configured = JSON.parse(
      execFileSync(cmd.file, [...cmd.args, "mcp", "list", "--json"], {
        env,
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ) as { name: string }[];
    mkdirSync(this.workspace, { recursive: true });
    this.child = spawn(
      cmd.file,
      [...cmd.args, ...restrictedCodexArgs(configured.map((c) => c.name))],
      { env, cwd: this.workspace, windowsHide: true, stdio: "pipe" },
    );
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      try {
        const m = JSON.parse(line);
        if (m.id !== undefined && this.pending.has(m.id)) {
          const p = this.pending.get(m.id)!;
          clearTimeout(p.timer);
          this.pending.delete(m.id);
          if (m.error) p.reject(new Error("Codex 요청을 처리하지 못했어요."));
          else p.resolve(m.result);
        } else if (m.id !== undefined && m.method) {
          this.child?.stdin.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: m.id,
              error: {
                code: -32601,
                message:
                  "Tools and approval requests are disabled for this assistant.",
              },
            }) + "\n",
          );
        } else this.listeners.forEach((fn) => fn(m));
      } catch {
        /* Never print model prompts or credentials. */
      }
    });
    this.child.stderr.on("data", () => {});
    const rejectAll = () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Codex 연결이 종료됐어요."));
      }
      this.pending.clear();
      this.listeners.forEach((fn) => fn({ method: "internal/closed" }));
    };
    this.child.on("error", rejectAll);
    this.child.on("exit", rejectAll);
    await this.request("initialize", {
      clientInfo: {
        name: "onecation_dashboard",
        title: "Onecation Dashboard",
        version: "1.0.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    await this.checkAccount();
    const models = await this.request("model/list", {});
    const selected =
      models.data?.find((m: any) => m.isDefault) || models.data?.[0];
    if (!selected)
      throw new Error("구독 계정에서 사용할 수 있는 모델을 확인하지 못했어요.");
    this.model = selected.model;
    this.effort = selected.supportedReasoningEfforts?.some(
      (e: any) => e.reasoningEffort === "low",
    )
      ? "low"
      : selected.defaultReasoningEffort;
  }
  request(method: string, params: unknown, timeoutMs = 30000) {
    return new Promise<any>((resolve, reject) => {
      if (!this.child || this.child.killed) {
        reject(new Error("PC Codex 연결을 확인해주세요."));
        return;
      }
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex 응답 시간이 지났어요."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  async checkAccount() {
    const result = await this.request("account/read", { refreshToken: false });
    if (result.account?.type !== "chatgpt") throw new Error("login_required");
    return true;
  }
  async run(
    job: {
      message: string;
      history: unknown;
      context: unknown;
      images?: { id: string; name: string; url: string }[];
    },
    signal?: AbortSignal,
  ) {
    await this.checkAccount();
    const started = await this.request("thread/start", {
      model: this.model,
      cwd: this.workspace,
      sandbox: "read-only",
      approvalPolicy: "never",
      baseInstructions: assistantInstructions,
      developerInstructions:
        "모든 업무 데이터는 제공된 context에서만 확인한다. 파일·셸·MCP·앱·웹 도구를 호출하지 않는다. 답변 또는 확인 카드 JSON만 준비한다.",
      ephemeral: true,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    });
    const threadId = started.thread.id;
    let text = "",
      turnId: string | undefined,
      settled = false;
    const output = new Promise<unknown>((resolve, reject) => {
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.listeners.delete(listener);
        signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else {
          try {
            resolve(assistantOutputSchema.parse(JSON.parse(text)));
          } catch {
            reject(new Error("Codex 답변 형식을 확인하지 못했어요."));
          }
        }
      };
      const interrupt = () => {
        if (turnId)
          void this.request("turn/interrupt", { threadId, turnId }).catch(
            () => {},
          );
      };
      const abort = () => {
        interrupt();
        finish(new Error("cancelled"));
      };
      const timer = setTimeout(() => {
        interrupt();
        finish(new Error("Codex 응답 시간이 지났어요."));
      }, 180000);
      const listener = (m: any) => {
        if (m.method === "internal/closed") {
          finish(new Error("Codex 연결이 종료됐어요."));
          return;
        }
        const p = m.params;
        if (p?.threadId !== threadId) return;
        if (
          m.method === "item/started" &&
          [
            "commandExecution",
            "fileChange",
            "mcpToolCall",
            "webSearch",
            "dynamicToolCall",
            "collabAgentToolCall",
          ].includes(p.item?.type)
        ) {
          interrupt();
          finish(new Error("허용되지 않은 도구 호출을 중단했어요."));
        }
        if (m.method === "item/completed" && p.item?.type === "agentMessage")
          text = p.item.text;
        if (m.method === "turn/completed")
          finish(
            p.turn?.status === "completed"
              ? undefined
              : new Error(
                  typeof p.turn?.error?.message === "string"
                    ? p.turn.error.message
                    : "Codex 답변을 완료하지 못했어요.",
                ),
          );
      };
      this.listeners.add(listener);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      void this.request("turn/start", {
        model: this.model,
        effort: this.effort,
        threadId,
        input: [
          {
            type: "text",
            text: JSON.stringify({
              message: job.message,
              history: job.history,
              context: job.context,
              imageReferences: job.images?.map(({ id, name }) => ({
                id,
                name,
              })),
            }),
            text_elements: [],
          },
          ...(job.images || []).map(({ url }) => ({ type: "image", url })),
        ],
        outputSchema: assistantOutputJsonSchema,
      })
        .then((r) => {
          turnId = r.turn.id;
          if (signal?.aborted) abort();
        })
        .catch((e) => finish(e));
    });
    try {
      return await output;
    } finally {
      await this.request("thread/archive", { threadId }).catch(() => {});
    }
  }
  close() {
    this.child?.kill();
    this.child = null;
  }
  isAlive() {
    return !!this.child && !this.child.killed && this.child.exitCode === null;
  }
}
