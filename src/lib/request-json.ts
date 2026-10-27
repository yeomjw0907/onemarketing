export class RequestError extends Error {
  constructor(
    message: string,
    public status = 0,
    public reason: "http" | "network" | "timeout" | "response" = "http",
  ) {
    super(message);
    this.name = "RequestError";
  }
}
const reads = new Map<string, Promise<any>>();
export function requestJSON<T = any>(
  path: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; deduplicate?: boolean } = {},
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const read = method === "GET";
  const timeoutMs = options.timeoutMs ?? (read ? 10_000 : 30_000);
  const key = path + ":" + timeoutMs;
  const share = read && !init.signal && options.deduplicate !== false;
  if (share && reads.has(key)) return reads.get(key)!;
  async function run(): Promise<T> {
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const signal = init.signal
        ? AbortSignal.any([controller.signal, init.signal])
        : controller.signal;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          (async () => {
            const response = await fetch(path, {
              cache: "no-store",
              ...init,
              signal,
            });
            const text = await response.text();
            let data: any;
            try {
              data = JSON.parse(text);
            } catch {
              throw new RequestError(
                response.status === 401
                  ? "로그인이 만료됐어요. 다시 로그인해주세요."
                  : "서버 응답을 확인할 수 없어요. 잠시 후 다시 시도해주세요.",
                response.status >= 400 ? response.status : 502,
                "response",
              );
            }
            if (!response.ok)
              throw new RequestError(
                typeof data?.error === "string"
                  ? data.error
                  : response.status === 401
                    ? "로그인이 만료됐어요. 다시 로그인해주세요."
                    : "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
                response.status,
              );
            return data as T;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => {
                reject(
                  new RequestError(
                    read
                      ? "응답이 늦어지고 있어요. 잠시 후 다시 불러와주세요."
                      : "응답을 기다리는 시간이 초과됐어요. 새로고침해 저장 결과를 확인해주세요.",
                    0,
                    "timeout",
                  ),
                );
                controller.abort();
              },
              Math.max(1, timeoutMs - (Date.now() - started)),
            );
          }),
        ]);
        if (!read) reads.clear();
        return response;
      } catch (error) {
        if (init.signal?.aborted) throw error;
        const known =
          error instanceof RequestError
            ? error
            : new RequestError(
                "인터넷 연결을 확인하고 다시 시도해주세요.",
                0,
                "network",
              );
        if (
          read &&
          attempt === 0 &&
          known.reason !== "timeout" &&
          (known.reason === "network" ||
            [500, 502, 503, 504].includes(known.status)) &&
          Date.now() - started + 200 < timeoutMs
        ) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          continue;
        }
        throw known;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }
  const task = run();
  if (share) {
    reads.set(key, task);
    const clear = () => {
      if (reads.get(key) === task) reads.delete(key);
    };
    task.then(clear, clear);
  }
  return task;
}
