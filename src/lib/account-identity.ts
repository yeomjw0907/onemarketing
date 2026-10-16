// Canonical account/post identities shared by public intake and admin operations.
export function accountIdentity(raw: string): string {
  const u = new URL(raw);
  let host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
  if (host === "blog.naver.com") {
    const blog =
      u.searchParams.get("blogId") || path.split("/").filter(Boolean)[0];
    if (!blog || ["PostView.naver", "PostList.naver"].includes(blog))
      throw new Error("블로그 계정 주소를 확인해주세요.");
    return "naver:" + blog.toLowerCase();
  }
  if (host === "instagram.com") return "instagram:" + path.toLowerCase();
  if (host === "facebook.com" && path === "/profile.php")
    return host + ":" + u.searchParams.get("id");
  const params = new URLSearchParams(u.search);
  for (const key of [...params.keys()])
    if (/^(utm_|fbclid|igsh|ref|tracking)/i.test(key)) params.delete(key);
  params.sort();
  return host + path + (params.size ? "?" + params.toString() : "");
}
export function publicationIdentity(raw: string): string {
  const u = new URL(raw);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.port
  )
    throw new Error("올바른 게시물 주소를 입력하세요.");
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  if (host === "blog.naver.com") {
    const parts = path.split("/").filter(Boolean);
    const blog = u.searchParams.get("blogId") || parts[0];
    const post = u.searchParams.get("logNo") || parts[1];
    if (!blog || !post || !/^\d+$/.test(post))
      throw new Error("블로그 게시물 주소를 입력하세요.");
    return `naver:${blog.toLowerCase()}:${post}`;
  }
  if (host === "instagram.com") {
    const match = path.match(/^\/(p|reel|reels)\/([^/]+)$/);
    if (!match) throw new Error("인스타그램 게시물 주소를 입력하세요.");
    return `instagram:post:${match[2]}`;
  }
  if (["youtube.com", "youtu.be"].includes(host))
    return "youtube:post:" + (u.searchParams.get("v") || path.split("/").pop());
  const params = new URLSearchParams(u.search);
  for (const key of [...params.keys()])
    if (/^(utm_|fbclid|igsh|ref|tracking)/i.test(key)) params.delete(key);
  params.sort();
  return host + path + (params.size ? "?" + params.toString() : "");
}
export function publicationMatchesAccount(link: string, account: string) {
  const u = new URL(link);
  if (u.hostname.endsWith("blog.naver.com"))
    return (
      publicationIdentity(link).split(":").slice(0, 2).join(":") ===
      accountIdentity(account)
    );
  // Instagram/Clip URLs do not carry the author. Operator must confirm ownership in review.
  return true;
}
