import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeApplicationAccount } from "../src/lib/application-accounts";
import { applicationSchema } from "../src/lib/participant-application-schema";
test("채널별 아이디·핸들을 표준 URL로 변환하고 잘못된 플랫폼 주소를 거절한다", () => {
  assert.equal(
    normalizeApplicationAccount("instagram", "@Onecation"),
    "https://www.instagram.com/onecation/",
  );
  assert.equal(
    normalizeApplicationAccount("instagram", "onecation"),
    "https://www.instagram.com/onecation/",
  );
  assert.equal(
    normalizeApplicationAccount(
      "instagram",
      "https://instagram.com/onecation/?igsh=tracking",
    ),
    "https://www.instagram.com/onecation/",
  );
  assert.equal(
    normalizeApplicationAccount("youtube", "@onecation"),
    "https://www.youtube.com/@onecation",
  );
  assert.equal(
    normalizeApplicationAccount(
      "youtube",
      "https://youtube.com/@onecation?si=tracking",
    ),
    "https://www.youtube.com/@onecation",
  );
  assert.equal(
    normalizeApplicationAccount("blog", "https://m.blog.naver.com/onecation"),
    "https://blog.naver.com/onecation",
  );
  assert.equal(
    normalizeApplicationAccount(
      "facebook",
      "https://m.facebook.com/profile.php?id=123&tracking=true",
    ),
    "https://www.facebook.com/profile.php?id=123",
  );
  assert.equal(
    normalizeApplicationAccount(
      "linkedin",
      "https://linkedin.com/company/onecation/",
    ),
    "https://www.linkedin.com/company/onecation",
  );
  for (const [channel, value] of [
    ["blog", "https://evil.example/onecation"],
    ["instagram", "https://instagram.com.evil.example/onecation"],
    ["instagram", "https://instagram.com/p/123"],
    ["youtube", "https://youtube.com/watch?v=123"],
    ["youtube", "@bad handle"],
    ["linkedin", "https://linkedin.com/feed"],
    ["other", "javascript:alert(1)"],
    ["other", "https://user:password@example.com"],
  ])
    assert.throws(() => normalizeApplicationAccount(channel, value));
});
test("정규화한 계정의 중복을 검사하고 잘못된 입력은 검증 오류로 반환한다", () => {
  const base = { name: "신청자", phone: "010-1234-5678" };
  const a = (url: string) => ({
    id: crypto.randomUUID(),
    channel: "instagram",
    url,
  });
  assert.equal(
    applicationSchema.safeParse({
      ...base,
      accounts: [a("@onecation"), a("https://instagram.com/onecation")],
    }).success,
    false,
  );
  const invalid = applicationSchema.safeParse({
    ...base,
    accounts: [a("https://evil.example")],
  });
  assert.equal(invalid.success, false);
  if (!invalid.success)
    assert.deepEqual(invalid.error.issues[0].path, ["accounts", 0, "url"]);
});
