import { test, after } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { list, update, create } from "../src/lib/db";
import { notificationTemplates } from "../src/lib/sens";
import {
  templateMonitorTick,
  templateReady,
  type TemplateDetail,
} from "../src/lib/sens-template-monitor";
const originalFetch = globalThis.fetch;
const keys = [
  "SENS_MONITOR_ENABLED",
  "SENS_TEST_PHONE",
  "SENS_ENABLED",
  "NCP_ACCESS_KEY",
  "NCP_SECRET_KEY",
  "SENS_SERVICE_ID",
  "SENS_CHANNEL_ID",
  "APP_URL",
  ...Object.values(notificationTemplates).map((t) => t.env),
];
const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
after(() => {
  globalThis.fetch = originalFetch;
  for (const k of keys)
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
});
function configure(service: string) {
  Object.assign(process.env, {
    SENS_MONITOR_ENABLED: "true",
    SENS_TEST_PHONE: "01012345678",
    SENS_ENABLED: "false",
    NCP_ACCESS_KEY: "test",
    NCP_SECRET_KEY: "test",
    SENS_SERVICE_ID: service,
    SENS_CHANNEL_ID: "@test",
    APP_URL: "https://example.com",
  });
  for (const [k, t] of Object.entries(notificationTemplates))
    process.env[t.env] = k;
}
const detail = (code: string): TemplateDetail => ({
  templateCode: code,
  channelId: "@test",
  templateInspectionStatus: "COMPLETE",
  templateStatus: "ACTIVE",
  isBlock: false,
  isDormant: false,
  content:
    notificationTemplates[code as keyof typeof notificationTemplates].text,
  buttons: [
    {
      type: "WL",
      name: "참여자 화면",
      linkMobile: "https://example.com/participants/portal",
      linkPc: "https://example.com/participants/portal",
    },
  ],
});
test("approval requires complete status, usable profile and exact text/button/channel", () => {
  const d = detail("materials");
  const ready = (v: TemplateDetail) =>
    templateReady(v, "materials", d.content, "@test", "https://example.com");
  assert.equal(ready(d), true);
  for (const patch of [
    { templateInspectionStatus: "REGISTER" },
    { templateStatus: "STOP" },
    { isDormant: true },
    { isBlock: true },
    { content: "different" },
    { buttons: [] },
    { channelId: "@other" },
  ])
    assert.equal(ready({ ...d, ...patch }), false);
});
test("pending/rejected templates are checked without sending; unchanged polls are throttled", async () => {
  configure("pending");
  let gets = 0,
    posts = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      posts++;
      return Response.json({});
    }
    gets++;
    const code = new URL(String(input)).searchParams.get("templateCode")!;
    return Response.json([
      {
        ...detail(code),
        templateInspectionStatus: code === "revision" ? "REJECT" : "REGISTER",
      },
    ]);
  };
  await templateMonitorTick();
  await templateMonitorTick();
  assert.equal(gets, 5);
  assert.equal(posts, 0);
  const n = (await list("notification_outbox")).find((n) =>
    String(n.monitorKey).includes(":pending:"),
  )!;
  assert.equal(n.status, "rejected");
  assert.equal((n.templateStates as unknown[]).length, 5);
});
test("concurrent approval checks send exactly one authorized test while normal sending stays off", async () => {
  configure("approved");
  let posts = 0;
  const normal = await create("notification_outbox", {
    status: "queued",
    type: "materials",
    to: "01099998888",
  });
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      posts++;
      const b = JSON.parse(String(init.body));
      assert.equal(b.messages.length, 1);
      assert.equal(b.messages[0].to, "01012345678");
      assert.equal(b.messages[0].useSmsFailover, false);
      return Response.json({
        requestId: "req",
        messages: [{ messageId: "msg", requestStatusCode: "A000" }],
      });
    }
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages/msg"))
      return Response.json({
        messageStatusName: "success",
        messageStatusCode: "0000",
      });
    return Response.json([detail(url.searchParams.get("templateCode")!)]);
  };
  await Promise.all([templateMonitorTick(), templateMonitorTick()]);
  assert.equal(posts, 1);
  const n = (await list("notification_outbox")).find((n) =>
    String(n.monitorKey).includes(":approved:"),
  )!;
  assert.equal(n.status, "accepted");
  await update(n.id, { lastCheckedAt: "2020-01-01" });
  await templateMonitorTick();
  assert.equal(posts, 1);
  assert.equal(
    (await list("notification_outbox")).find((v) => v.id === n.id)!.status,
    "succeeded",
  );
  assert.equal(
    (await list("notification_outbox")).find((v) => v.id === normal.id)!.status,
    "queued",
  );
  assert.equal(process.env.SENS_ENABLED, "false");
});
test("uncertain send is never automatically retried", async () => {
  configure("uncertain");
  let posts = 0;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      posts++;
      throw new Error("timeout");
    }
    return Response.json([
      detail(new URL(String(input)).searchParams.get("templateCode")!),
    ]);
  };
  await templateMonitorTick();
  const n = (await list("notification_outbox")).find((n) =>
    String(n.monitorKey).includes(":uncertain:"),
  )!;
  assert.equal(n.status, "uncertain");
  await update(n.id, { lastCheckedAt: "2020-01-01" });
  await templateMonitorTick();
  assert.equal(posts, 1);
});
