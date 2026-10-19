import { test } from "node:test";
import assert from "node:assert/strict";
import { runningOrbState } from "../src/lib/orb-state";
test("only actively running jobs have an Orb state", () => {
  for (const status of [
    "pending",
    "uncertain",
    "failed",
    "succeeded",
    "cancelled",
    undefined,
  ])
    assert.equal(runningOrbState({ type: "copy", status }), null);
  assert.equal(runningOrbState(undefined), null);
});
test("Orb motion follows actual production work rather than an invented progress sequence", () => {
  for (const type of ["research", "product-review"])
    assert.equal(runningOrbState({ status: "running", type }), "searching");
  for (const type of ["copy", "scenario", "media-plan"])
    assert.equal(runningOrbState({ status: "running", type }), "composing");
  for (const type of ["image", "video", "slideshow"])
    assert.equal(runningOrbState({ status: "running", type }), "shaping");
  assert.equal(
    runningOrbState({ status: "running", type: "unknown" }),
    "working",
  );
});

test("verification animation follows explicit verification logs and never a queued job", () => {
  assert.equal(
    runningOrbState({ status: "running", type: "copy" }, "copy_verify"),
    "solving",
  );
  assert.equal(
    runningOrbState({ status: "running", type: "copy" }, "copy_reverify"),
    "solving",
  );
  assert.equal(
    runningOrbState({ status: "running", type: "copy" }, "copy_repair"),
    "composing",
  );
  assert.equal(
    runningOrbState({ status: "pending", type: "copy" }, "copy_verify"),
    null,
  );
});
