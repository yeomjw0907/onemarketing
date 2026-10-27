import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { requestJSON, RequestError } from "../src/lib/request-json";
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
test("동시 GET은 공유하고 완료 후 새로고침은 새 요청을 보낸다", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return Response.json({ ok: true });
  };
  const [a, b] = await Promise.all([
    requestJSON("/dedup"),
    requestJSON("/dedup"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  await requestJSON("/dedup");
  assert.equal(calls, 2);
});
test("일시적인 GET 실패만 한 번 재시도하고 저장 요청은 반복하지 않는다", async () => {
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls === 1
      ? Response.json({ error: "잠시 후" }, { status: 503 })
      : Response.json({ ok: true });
  assert.equal((await requestJSON("/retry")).ok, true);
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: "실패" }, { status: 503 });
  };
  await assert.rejects(requestJSON("/write", { method: "POST" }), RequestError);
  assert.equal(calls, 1);
});
test("끝나지 않는 요청을 제한 시간 안에 종료하고 HTML 오류를 사용자 메시지로 바꾼다", async () => {
  globalThis.fetch = async () => new Promise(() => {});
  const start = Date.now();
  await assert.rejects(
    requestJSON("/timeout", {}, { timeoutMs: 15 }),
    (e) => e instanceof RequestError && e.reason === "timeout",
  );
  assert.ok(Date.now() - start < 500);
  globalThis.fetch = async () =>
    new Response("<html>proxy failure</html>", { status: 502 });
  await assert.rejects(
    requestJSON("/html", { method: "POST" }),
    (e) => e instanceof RequestError && !e.message.includes("Unexpected"),
  );
});
test("로그인 만료를 재시도하지 않고 실패한 요청이 다음 재시도를 막지 않는다", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: "로그인 필요" }, { status: 401 });
  };
  await assert.rejects(
    requestJSON("/session"),
    (e) => e instanceof RequestError && e.status === 401,
  );
  assert.equal(calls, 1);
  globalThis.fetch = async () => Response.json({ ok: true });
  assert.equal((await requestJSON("/session")).ok, true);
});
