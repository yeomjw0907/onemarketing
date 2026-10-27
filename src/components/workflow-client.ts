import { requestJSON } from "@/lib/request-json";
export async function workflowApi<T = any>(
  url: string,
  body?: unknown,
): Promise<T> {
  return requestJSON<T>(
    url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
