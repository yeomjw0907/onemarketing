import { test } from "node:test";
import assert from "node:assert/strict";
import {
  databaseUnavailable,
  databaseUnavailableResponse,
} from "../src/lib/database-errors";

test("pool admission failures are retryable server errors, not revoked authentication", async () => {
  for (const error of [
    Object.assign(
      new Error("(EMAXCONNSESSION) max clients reached in session mode"),
      { code: "XX000" },
    ),
    { code: "53300" },
    { cause: { code: "ECONNRESET" } },
    new Error("timeout exceeded when trying to connect"),
  ])
    assert.equal(databaseUnavailable(error), true);
  const response = databaseUnavailableResponse();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.doesNotMatch(
    JSON.stringify(await response.json()),
    /EMAX|session mode|token/,
  );
});

test("invalid credentials and business validation are not connection failures", () => {
  for (const error of [
    null,
    new Error("로그인이 필요합니다."),
    new Error("PC 연결 인증이 필요해요."),
    { code: "23505" },
    { code: "28P01" },
  ])
    assert.equal(databaseUnavailable(error), false);
});
