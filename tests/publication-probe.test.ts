import { test } from "node:test";
import assert from "node:assert/strict";
import {
  probeUrl,
  classifyPublication,
  probePublication,
} from "../src/lib/publication-probe";

test("only fixed platform post URLs are probed; redirects cannot escape allowlist", async () => {
  for (const link of [
    "http://127.0.0.1/",
    "http://169.254.169.254/",
    "https://blog.naver.com.evil.test/a/1",
    "https://blog.naver.com:444/a/1",
    "https://u:p@blog.naver.com/a/1",
    "https://naver.me/a",
    "file:///a",
    "https://blog.naver.com/",
  ])
    assert.equal(probeUrl(link), null);
  assert.equal(
    probeUrl("https://blog.naver.com/PostView.naver?blogId=sample&logNo=123")
      ?.href,
    "https://m.blog.naver.com/sample/123",
  );
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, "m.blog.naver.com");
    assert.equal(init?.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/" },
    });
  };
  try {
    assert.equal(
      (await probePublication("https://blog.naver.com/sample/123")).state,
      "unknown",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("200 is not proof of publication; matching identity and actual content are required", () => {
  const url = new URL("https://m.blog.naver.com/sample/123");
  const body =
    '<meta property="og:url" content="https://blog.naver.com/sample/123"><div class="se-main-container">게시글</div>';
  assert.equal(classifyPublication(200, body, url).state, "public");
  assert.equal(
    classifyPublication(200, body.replace("/123", "/456"), url).state,
    "unknown",
  );
  assert.equal(classifyPublication(200, "로그인하세요", url).state, "unknown");
  assert.equal(
    classifyPublication(200, body + "삭제된 게시물에 대한 설명", url).state,
    "public",
  );
  assert.equal(
    classifyPublication(
      200,
      "<script>alert('비공개 게시물입니다');</script>",
      url,
    ).state,
    "missing",
  );
  for (const status of [401, 403, 429, 500, 503, 302])
    assert.equal(
      classifyPublication(status, "삭제된 게시물", url).state,
      "unknown",
    );
  assert.equal(classifyPublication(404, "", url).state, "missing");
});
