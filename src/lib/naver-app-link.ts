// NAVER's documented inappbrowser v6 scheme. Never pass participant session URLs.
export function naverAppLinks(userAgent: string, channel = "blog") {
  const web =
    channel === "clip" ? "https://m.naver.com/" : "https://m.blog.naver.com/";
  const command = `inappbrowser?url=${encodeURIComponent(web)}&target=new&version=6`;
  const android = /Android/i.test(userAgent);
  const ios =
    /iPhone|iPad|iPod/i.test(userAgent) || /Macintosh.*Mobile/i.test(userAgent);
  return {
    web,
    app: android
      ? `intent://${command}#Intent;scheme=naversearchapp;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.search;S.browser_fallback_url=${encodeURIComponent(web)};end;`
      : ios
        ? `naversearchapp://${command}`
        : web,
    mobile: android || ios,
    install: ios
      ? "https://apps.apple.com/kr/app/id393499958"
      : "https://play.google.com/store/apps/details?id=com.nhn.android.search",
  };
}
