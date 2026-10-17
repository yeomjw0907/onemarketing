import { test } from "node:test";
import assert from "node:assert/strict";
import { naverAppLinks } from "../src/lib/naver-app-link";
test("Android opens the official NAVER app with a fixed public web fallback", () => {
  const links = naverAppLinks("Mozilla Android 14", "blog");
  assert.ok(links.mobile);
  assert.match(links.app, /^intent:\/\/inappbrowser\?/);
  assert.match(links.app, /package=com.nhn.android.search;/);
  assert.match(
    links.app,
    /S.browser_fallback_url=https%3A%2F%2Fm.blog.naver.com%2F;/,
  );
});
test("iOS uses NAVER scheme; desktop uses web; untrusted channel never becomes a URL", () => {
  const ios = naverAppLinks("Mozilla iPhone", "clip");
  assert.match(ios.app, /^naversearchapp:\/\/inappbrowser\?/);
  assert.equal(ios.web, "https://m.naver.com/");
  assert.match(ios.install, /apps.apple.com/);
  const desktop = naverAppLinks("Windows NT 10.0", "javascript:alert(1)");
  assert.equal(desktop.mobile, false);
  assert.equal(desktop.app, "https://m.blog.naver.com/");
  assert.equal(naverAppLinks("Macintosh Mobile").mobile, true);
});
