import { test } from "node:test";
import assert from "node:assert/strict";
import { toKrw } from "../src/lib/currency";
test("USD amounts and totals convert without changing the original charge; rounding happens after summing", () => {
  const rate = 1336.79;
  assert.equal(toKrw(0.0622, rate), 83);
  assert.equal(toKrw(0.1866, rate), 249);
  assert.equal(toKrw(4.82826, rate), 6454);
  assert.equal(toKrw(5.247748, rate), 7015);
  assert.equal(toKrw(0, rate), 0);
  assert.equal(toKrw(null, rate), null);
  assert.equal(toKrw(1, null), null);
  assert.throws(() => toKrw(1, 0));
  assert.throws(() => toKrw(NaN, rate));
  assert.equal(toKrw(0.01 + 0.01, rate), 27);
  assert.equal(toKrw(0.01, rate)! + toKrw(0.01, rate)!, 26);
});
