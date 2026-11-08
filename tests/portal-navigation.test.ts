import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialPortalTab,
  portalTab,
  portalTabs,
} from "../src/lib/portal-navigation";
import { participantNext } from "../src/lib/public-progress";

test("requested valid tabs survive reload regardless of incoming work", () => {
  for (const tab of portalTabs)
    assert.equal(initialPortalTab(tab, true, 5), tab);
  assert.equal(portalTab("admin"), "");
  assert.equal(portalTab("payments&token=secret"), "");
});
test("pending proposals and assigned work take priority; empty members can find applications", () => {
  assert.equal(initialPortalTab(null, true, 4), "offers");
  assert.equal(initialPortalTab(null, false, 4), "tasks");
  assert.equal(initialPortalTab("invalid", false, 0), "applications");
  assert.equal(participantNext([], 0).tab, "applications");
  assert.equal(participantNext([], 2).tab, "offers");
});
