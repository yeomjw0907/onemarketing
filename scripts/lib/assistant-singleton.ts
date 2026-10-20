import { createHash } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

// A Windows named pipe disappears when the owning process exits, including crashes.
// It has no command interface and doesn't expose a TCP port or credentials.
export async function acquireWindowsAssistantLock(configPath: string) {
  if (process.platform !== "win32") return { async release() {} };
  const key = createHash("sha256")
    .update(path.resolve(configPath).toLowerCase())
    .digest("hex")
    .slice(0, 24);
  const server = createServer((socket) => socket.destroy());
  return new Promise<{ release: () => Promise<void> } | null>(
    (resolve, reject) => {
      server.once("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "EADDRINUSE")
          resolve(null);
        else reject(error);
      });
      server.listen("\\\\.\\pipe\\onecation-assistant-" + key, () =>
        resolve({
          release: () =>
            new Promise<void>((done, error) =>
              server.close((e) => (e ? error(e) : done())),
            ),
        }),
      );
    },
  );
}
