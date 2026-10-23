import { config } from "dotenv";
import { randomUUID, createHash } from "node:crypto";
import http from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
Object.assign(globalThis, { AsyncLocalStorage });
const { default: next } = await import("next");
config({ path: ".env.local", quiet: true });
process.env.DB_SCHEMA =
  "acceptance_market_" + randomUUID().replaceAll("-", "").slice(0, 10);
process.env.SUPABASE_STORAGE_PREFIX = process.env.DB_SCHEMA + "/";
process.env.APP_URL = "http://127.0.0.1:3120";
process.env.COOKIE_SECURE = "false";
process.env.JOB_RUNNER = "worker";
process.env.SENS_BRAND_ENABLED = "false";
const { applyMigrations, dropSchema } = await import("../src/lib/migrate");
const { save } = await import("../src/lib/domain");
const { create, update, closeDb } = await import("../src/lib/db");
const { passwordHash } = await import("../src/lib/auth");
const { marketAdmin, advertiserAuth, orderProduct } =
  await import("../src/lib/market");
const { confirmQuote } = await import("../src/lib/quote-workflow");
await applyMigrations();
process.env.ADMIN_USERS_JSON = JSON.stringify([
  { email: "market-qa@local.test", hash: passwordHash("market-qa-password") },
]);
const actor = "market-qa@local.test";
const blog = await save(
  "prices",
  {
    name: "블로그 QA",
    channel: "blog",
    sale: 15000,
    payout: 3000,
    aiEstimate: 5000,
    images: 3,
    duration: 0,
    mode: "slideshow",
    revisions: 1,
  },
  actor,
);
const clip = await save(
  "prices",
  {
    name: "클립 QA",
    channel: "clip",
    sale: 25000,
    payout: 3000,
    aiEstimate: 15000,
    images: 0,
    duration: 10,
    mode: "generated",
    revisions: 1,
  },
  actor,
);
let published;
for (const type of ["blog", "clip", "bundle"])
  published = await marketAdmin(
    {
      action: "catalog",
      data: {
        type,
        title:
          type === "blog"
            ? "블로그 콘텐츠 제작·게시"
            : type === "clip"
              ? "클립 영상 제작·게시"
              : "블로그 + 클립 패키지",
        description: "브랜드에 맞는 콘텐츠를 제작하고 게시까지 진행합니다.",
        details:
          "원고·이미지 또는 클립 제작과 게시를 포함합니다. 기본 수정 1회, 일정은 자료 확인 후 협의합니다.",
        blogPriceId: blog.id,
        clipPriceId: clip.id,
        published: true,
      },
    },
    actor,
  );
const a = await advertiserAuth(
  {
    action: "register",
    email: "sample@local.test",
    password: "sample-password",
    name: "샘플 광고주",
    phone: "01012345678",
    consent: true,
  },
  "fixture",
);
const order = await orderProduct(a.account.id, {
  id: randomUUID(),
  catalogId: published!.id,
  catalogVersion: published!.version,
  expectedUnit: 40000,
  quantity: 2,
  brand: "QA 브랜드",
  product: "QA 제품",
  productUrl: "https://example.com",
  start: "2027-01-01",
  end: "2027-01-31",
  notes: "QA 캠페인",
  consent: true,
});
const converted = await marketAdmin(
  { action: "convert", id: order.id, version: order.version },
  actor,
);
const { get } = await import("../src/lib/db");
const q = (await get(converted.data.quoteId))!;
const confirmed = await confirmQuote(q.id, q.version, actor);
await marketAdmin(
  {
    action: "campaign",
    data: {
      projectId: confirmed.projectId,
      title: "브랜드 소개 블로그·클립 캠페인",
      description: "제공된 콘텐츠를 확인하고 내 채널에 게시하는 캠페인입니다.",
      guide:
        "블로그 원고·이미지 3장과 클립 영상을 제공합니다. 두 게시물의 링크를 제출하고 90일 공개 유지해주세요. 게시 확인과 검수 후 원고료를 지급합니다.",
      deadline: "2027-01-20",
      published: true,
    },
  },
  actor,
);
const participant = await save(
  "participants",
  {
    name: "QA 참여자",
    phone: "01098765432",
    payment: { method: "kakaopay" },
    accounts: [
      {
        id: randomUUID(),
        channel: "blog",
        url: "https://blog.naver.com/market-qa",
        approvalStatus: "approved",
      },
    ],
  },
  actor,
);
await update(participant.id, {
  accounts: (participant.accounts as any[]).map((a) => ({
    ...a,
    ownershipVerifiedAt: new Date().toISOString(),
  })),
});
const parent = await create("portal_links", {
  participantId: participant.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
await create("portal_links", {
  purpose: "session",
  parentId: parent.id,
  participantId: participant.id,
  tokenHash: createHash("sha256").update("a".repeat(64)).digest("hex"),
  verifiedPhone: participant.phone,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const app = next({ dev: false, hostname: "127.0.0.1", port: 3120 });
await app.prepare();
const server = http.createServer(app.getRequestHandler());
server.listen(3120, "127.0.0.1", () =>
  console.log(
    "Market acceptance ready: http://127.0.0.1:3120 · isolated schema " +
      process.env.DB_SCHEMA,
  ),
);
async function cleanup() {
  server.close();
  await app.close();
  await dropSchema();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", () => void cleanup());
process.on("SIGTERM", () => void cleanup());
