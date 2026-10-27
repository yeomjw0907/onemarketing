import { requestJSON } from "@/lib/request-json";
export async function marketFetch(path: string, body?: unknown) {
  return requestJSON(
    path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
