export async function workflowApi<T = any>(
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...(body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "처리하지 못했습니다.");
  return value as T;
}
