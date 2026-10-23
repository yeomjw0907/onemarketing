export async function marketFetch(path: string, body?: unknown) {
  const r = await fetch(path, {
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "요청에 실패했습니다.");
  return d;
}
