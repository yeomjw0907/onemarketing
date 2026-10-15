export const accountInputs: Record<
  string,
  { label: string; placeholder: string; help: string }
> = {
  blog: {
    label: "블로그 주소",
    placeholder: "https://blog.naver.com/onecation",
    help: "클립도 같은 네이버 블로그 계정으로 참여합니다.",
  },
  clip: {
    label: "블로그 주소",
    placeholder: "https://blog.naver.com/onecation",
    help: "클립도 같은 네이버 블로그 계정으로 참여합니다.",
  },
  instagram: {
    label: "인스타그램 아이디",
    placeholder: "@onecation",
    help: "@ 없이 입력하거나 프로필 주소를 붙여 넣어도 됩니다.",
  },
  facebook: {
    label: "페이스북 프로필 또는 페이지 주소",
    placeholder: "https://www.facebook.com/onecation",
    help: "본인이 운영하는 프로필이나 페이지 주소를 입력해주세요.",
  },
  linkedin: {
    label: "링크드인 프로필 또는 회사 페이지 주소",
    placeholder: "https://www.linkedin.com/in/onecation",
    help: "개인 프로필 또는 회사 페이지 주소를 입력해주세요.",
  },
  youtube: {
    label: "유튜브 채널 주소 또는 핸들",
    placeholder: "@onecation",
    help: "@핸들이나 채널 주소를 입력해주세요. 영상 주소는 사용할 수 없어요.",
  },
  other: {
    label: "활동 계정 주소",
    placeholder: "https://example.com/onecation",
    help: "본인이 운영하는 계정의 전체 주소를 입력해주세요.",
  },
};
export function normalizeApplicationAccount(
  channel: string,
  raw: string,
): string {
  const value = raw.trim();
  if (!value)
    throw new Error(
      `${accountInputs[channel]?.label || "계정 주소"}를 입력해주세요.`,
    );
  if (
    channel === "instagram" &&
    !value.includes("://") &&
    !value.includes("/")
  ) {
    const handle = value.replace(/^@/, "");
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle) || !/[a-zA-Z0-9_]/.test(handle))
      throw new Error("인스타그램 아이디를 확인해주세요.");
    return `https://www.instagram.com/${handle.toLowerCase()}/`;
  }
  if (channel === "youtube" && value.startsWith("@")) {
    const handle = value.slice(1);
    if (!handle || /[\s/?#@]/.test(handle))
      throw new Error("유튜브 핸들을 확인해주세요.");
    return `https://www.youtube.com/@${encodeURIComponent(handle)}`;
  }
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
    );
  } catch {
    throw new Error("올바른 계정 주소를 입력해주세요.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("올바른 웹 계정 주소를 입력해주세요.");
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "");
  const root = (domain: string) =>
    host === domain || host === `www.${domain}` || host === `m.${domain}`;
  if (channel === "blog" || channel === "clip") {
    if (!["blog.naver.com", "m.blog.naver.com"].includes(host) || !path)
      throw new Error("네이버 블로그 주소를 입력해주세요.");
    return `https://blog.naver.com${path}${url.search}`;
  }
  if (channel === "instagram") {
    if (
      !root("instagram.com") ||
      !/^\/[a-zA-Z0-9._]{1,30}$/.test(path) ||
      ["p", "reel", "reels", "stories", "explore", "accounts"].includes(
        path.slice(1).toLowerCase(),
      )
    )
      throw new Error("인스타그램 프로필 주소 또는 아이디를 입력해주세요.");
    return `https://www.instagram.com${path.toLowerCase()}/`;
  }
  if (channel === "facebook") {
    if (
      !root("facebook.com") ||
      !path ||
      (path === "/profile.php" && !url.searchParams.get("id"))
    )
      throw new Error("페이스북 프로필 또는 페이지 주소를 입력해주세요.");
    return `https://www.facebook.com${path}${path === "/profile.php" ? `?id=${encodeURIComponent(url.searchParams.get("id")!)}` : ""}`;
  }
  if (channel === "linkedin") {
    if (!root("linkedin.com") || !/^\/(in|company|school)\/[^/]+$/.test(path))
      throw new Error("링크드인 프로필 또는 회사 페이지 주소를 입력해주세요.");
    return `https://www.linkedin.com${path}`;
  }
  if (channel === "youtube") {
    if (
      !root("youtube.com") ||
      !/^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)$/.test(path)
    )
      throw new Error("유튜브 채널 주소 또는 @핸들을 입력해주세요.");
    return `https://www.youtube.com${path}`;
  }
  if (!host.includes(".")) throw new Error("전체 웹 계정 주소를 입력해주세요.");
  return url.toString();
}
export function accountInputValue(channel: string, value: string) {
  try {
    const url = new URL(value);
    if (channel === "instagram" && /(^|\.)instagram\.com$/.test(url.hostname))
      return "@" + url.pathname.split("/").filter(Boolean)[0];
    if (channel === "youtube" && url.pathname.startsWith("/@"))
      return decodeURIComponent(url.pathname.slice(1));
  } catch {}
  return value;
}
