import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loginEntryRole,
  safeLoginReturnPath,
  advertiserLoginPath,
  applyAdvertiserReturn,
  safeParticipantPortalReturn,
  participantPortalReturn,
  applyParticipantReturn,
} from "../src/lib/login-entry";

test("explicit participant signup does not open advertiser onboarding", () => {
  assert.equal(loginEntryRole("participant", "1", ""), "participant");
  assert.equal(loginEntryRole("participant", "1", "/marketing"), "participant");
});

test("participant portal return retains only its tab and excludes access tokens and the advertiser workspace", () => {
  const path = participantPortalReturn(
    "/participants/portal",
    "?tab=payments&access=private-token&ref=sample",
  );
  assert.equal(path, "/participants/portal?tab=payments");
  assert.equal(
    participantPortalReturn(
      "/login",
      "?next=%2Fparticipants%2Fportal%3Ftab%3Dapplications",
    ),
    "/participants/portal?tab=applications",
  );
  assert.equal(
    participantPortalReturn("/login", "?next=%2Fcampaigns%2F123"),
    "",
  );
  for (const invalid of [
    "https://evil.test",
    "/advertisers?tab=orders",
    "/participants/portal?tab=payments&access=secret",
    "/participants/portal?tab=admin",
  ])
    assert.equal(safeParticipantPortalReturn(invalid), "");
  const destination = new URL("https://example.com/participants/portal");
  applyParticipantReturn(destination, path);
  assert.equal(
    destination.href,
    "https://example.com/participants/portal?tab=payments",
  );
  applyAdvertiserReturn(destination, path);
  assert.equal(
    destination.href,
    "https://example.com/participants/portal?tab=payments",
  );
});

test("dashboard return preserves the requested tab through login and OAuth destination", () => {
  for (const tab of ["overview", "orders", "products"]) {
    const login = new URL(advertiserLoginPath(tab), "https://example.com");
    assert.equal(login.searchParams.get("role"), "advertiser");
    assert.equal(login.searchParams.get("next"), `/advertisers?tab=${tab}`);
    const destination = new URL("/advertisers", "https://example.com");
    applyAdvertiserReturn(destination, login.searchParams.get("next"));
    assert.equal(
      destination.href,
      `https://example.com/advertisers?tab=${tab}`,
    );
  }
});

test("return targets reject external URLs, credentials, tokens and unsupported parameters", () => {
  for (const value of [
    "//evil.test",
    "https://evil.test",
    "/\\evil.test",
    "/admin",
    "/advertisers?tab=orders&next=https://evil.test",
    "/advertisers?tab=orders#secret",
    "/advertisers?token=secret",
    "/advertisers?tab=%6frders",
    "/advertisers\n",
    null,
    {},
    ["/advertisers"],
  ]) {
    assert.equal(safeLoginReturnPath(value), "");
    const destination = new URL("https://example.com/advertisers");
    applyAdvertiserReturn(destination, value);
    assert.equal(destination.href, "https://example.com/advertisers");
  }
  assert.equal(
    new URL(
      advertiserLoginPath("orders&token=secret"),
      "https://example.com",
    ).searchParams.get("next"),
    "/advertisers",
  );
  assert.equal(safeLoginReturnPath("/marketing"), "/marketing");
});
test("explicit advertiser entry and existing default destinations remain stable", () => {
  assert.equal(
    loginEntryRole("advertiser", undefined, "/campaigns/example"),
    "advertiser",
  );
  assert.equal(loginEntryRole(undefined, "1", ""), "advertiser");
  assert.equal(
    loginEntryRole(undefined, undefined, "/marketing"),
    "advertiser",
  );
  assert.equal(
    loginEntryRole(undefined, undefined, "/campaigns/example"),
    "participant",
  );
  assert.equal(loginEntryRole("admin", undefined, ""), "advertiser");
});
