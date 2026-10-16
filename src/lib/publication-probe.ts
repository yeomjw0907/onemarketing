import { publicationIdentity } from "./account-identity";

export type ProbeResult = {
  state: "public" | "missing" | "unknown" | "unsupported";
  reason: string;
};

// Only fixed platform hosts and post paths are fetched. Redirects, credentials,
// arbitrary ports and short URLs are deliberately not followed (SSRF boundary).
export function probeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port
    )
      return null;
    if (["blog.naver.com", "m.blog.naver.com"].includes(u.hostname)) {
      const identity = publicationIdentity(raw).split(":");
      if (identity.length !== 3 || !/^[a-z0-9_-]+$/i.test(identity[1]))
        return null;
      return new URL(`https://m.blog.naver.com/${identity[1]}/${identity[2]}`);
    }
    if (
      (u.hostname === "m.naver.com" &&
        /^\/shorts\/?$/.test(u.pathname) &&
        /^[a-z0-9_-]+$/i.test(u.searchParams.get("mediaId") || "")) ||
      (["tv.naver.com", "m.tv.naver.com"].includes(u.hostname) &&
        /^\/v\/\d+\/?$/.test(u.pathname))
    ) {
      u.protocol = "https:";
      return u;
    }
  } catch {}
  return null;
}

export function classifyPublication(
  status: number,
  html: string,
  url: URL,
): ProbeResult {
  // Throttling, login walls, robots checks and server errors are never deletion.
  if (
    status === 401 ||
    status === 403 ||
    status === 429 ||
    status >= 500 ||
    (status >= 300 && status < 400)
  )
    return { state: "unknown", reason: "접속 제한·로그인·일시 오류" };
  if (status === 404 || status === 410)
    return { state: "missing", reason: `게시물 응답 ${status}` };
  if (status !== 200)
    return { state: "unknown", reason: `확인 불가 응답 ${status}` };
  if (
    /captcha|자동입력\s*방지|비정상적인\s*접근|접근이\s*제한|일시적으로\s*서비스/i.test(
      html,
    )
  )
    return { state: "unknown", reason: "플랫폼 접근 제한" };
  const blogBody = /class=["'][^"']*\b(?:se-main-container|post_ct)\b/i.test(
    html,
  );
  // A body alone (e.g. an error page or another post) is insufficient.
  const og = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1];
  const canonical = og.find((tag) => attr(tag, "property") === "og:url");
  let samePost = false;
  try {
    samePost =
      !!canonical &&
      publicationIdentity(
        attr(canonical, "content")!.replace(/&amp;/g, "&"),
      ) === publicationIdentity(url.href);
  } catch {}
  const video = og.some(
    (tag) =>
      /^og:video(?::url)?$/.test(attr(tag, "property") || "") &&
      /^https:\/\//.test(attr(tag, "content") || ""),
  );
  if (samePost && (url.hostname === "m.blog.naver.com" ? blogBody : video))
    return { state: "public", reason: "게시물 식별과 공개 콘텐츠 확인" };
  if (
    !blogBody &&
    /(?:alert\s*\(\s*["'][^"']*|<(?:h1|h2|p)[^>]*>\s*)(?:삭제된\s*게시물|비공개\s*게시물|존재하지\s*않는\s*게시물|게시물이\s*삭제|비공개로\s*설정)/i.test(
      html,
    )
  )
    return { state: "missing", reason: "삭제·비공개 안내 확인" };
  return { state: "unknown", reason: "공개 콘텐츠를 확실히 확인하지 못함" };
}

export async function probePublication(raw: string): Promise<ProbeResult> {
  const url = probeUrl(raw);
  if (!url)
    return {
      state: "unsupported",
      reason: "자동 확인 미지원 주소 · 수동 확인 필요",
    };
  try {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Onecation-Retention/1.0", Accept: "text/html" },
    });
    // Bound response size and elapsed time, including the body stream.
    let html = "",
      bytes = 0;
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2_000_000)
            return {
              state: "unknown",
              reason: "응답 크기 초과 · 수동 확인 필요",
            };
          html += decoder.decode(part.value, { stream: true });
        }
        html += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    return classifyPublication(response.status, html, url);
  } catch {
    return { state: "unknown", reason: "연결 오류·시간 초과" };
  }
}
