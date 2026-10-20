import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { acquireWindowsAssistantLock } from "../scripts/lib/assistant-singleton";

const windows = process.platform === "win32";
test(
  "Windows worker permits one process per device config and releases its lock",
  { skip: !windows },
  async () => {
    const name = path.join(os.tmpdir(), randomUUID() + ".json");
    const first = await acquireWindowsAssistantLock(name);
    assert.ok(first);
    try {
      assert.equal(await acquireWindowsAssistantLock(name), null);
    } finally {
      await first.release();
    }
    const next = await acquireWindowsAssistantLock(name);
    assert.ok(next);
    await next.release();
  },
);

test(
  "Windows startup supervisor restarts a crashed worker and stops after a normal exit",
  { skip: !windows, timeout: 30000 },
  async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "onecation-startup-test-"));
    const script = path.join(temp, "probe.ts"),
      count = path.join(temp, "count.txt");
    writeFileSync(
      script,
      `import{existsSync,readFileSync,writeFileSync}from'node:fs';const p=${JSON.stringify(count)};const n=existsSync(p)?Number(readFileSync(p,'utf8'))+1:1;writeFileSync(p,String(n));process.exit(n===1?1:0);`,
    );
    const ps = path.join(
      process.env.SystemRoot || "C:/Windows",
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    try {
      const result = await new Promise<{
        code: number | null;
        out: string;
        err: string;
      }>((resolve, reject) => {
        const child = spawn(
          ps,
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            path.resolve("scripts/assistant-startup.ps1"),
            "-Mode",
            "Run",
            "-NodeExe",
            process.execPath,
            "-WorkerScript",
            script,
            "-MutexName",
            "Local\\Onecation.Test." + randomUUID(),
            "-RestartDelaySeconds",
            "1",
          ],
          { windowsHide: true, env: { ...process.env, LOCALAPPDATA: temp } },
        );
        let out = "",
          err = "";
        child.stdout.on("data", (x) => (out += x));
        child.stderr.on("data", (x) => (err += x));
        child.on("error", reject);
        child.on("exit", (code) => resolve({ code, out, err }));
      });
      assert.equal(result.code, 0, result.err);
      assert.equal(existsSync(count), true, result.out + result.err);
      assert.equal(readFileSync(count, "utf8"), "2");
    } finally {
      assert.ok(
        path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep),
      );
      rmSync(temp, { recursive: true, force: true });
    }
  },
);
