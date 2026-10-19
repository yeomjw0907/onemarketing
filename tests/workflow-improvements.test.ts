import { randomBytes, createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import "./helpers";
import { save, command } from "../src/lib/domain";
import { get, list, create, update, transaction } from "../src/lib/db";
import { saveQuote, confirmQuote } from "../src/lib/quote-workflow";
import { weeklyTimeline } from "../src/lib/workflow-policy";
import {
  accountIdentity,
  publicationIdentity,
} from "../src/lib/account-identity";
import {
  proposeWork,
  respondOffer,
  splitSlot,
  partialPay,
  cancelPartialPay,
  upgradeBundle,
} from "../src/lib/work-offers";
import { quotePDF, proposalPDF, quoteWorkbook } from "../src/lib/customer-pdfs";
import { issuePortal, portalParticipant, portalView } from "../src/lib/portal";
import { changeReferrer, syncReferral } from "../src/lib/referrals";
import { submitApplication } from "../src/lib/participant-applications";
import {
  sensSignature,
  renderNotification,
  queueNotification,
  sendNotification,
  refreshNotification,
} from "../src/lib/sens";
const actor = "workflow@test.local";
async function fixture() {
  const c = await save(
    "customers",
    { name: "테스트 고객", brand: "검증 브랜드" },
    actor,
  );
  const price = (channel: string) =>
    save(
      "prices",
      {
        name: channel,
        channel,
        sale: 10000,
        payout: 3000,
        aiEstimate: 1000,
        images: channel === "blog" ? 3 : 0,
        duration: channel === "clip" ? 10 : 0,
        mode: channel === "clip" ? "generated" : "slideshow",
        revisions: 1,
      },
      actor,
    );
  const b = await price("blog"),
    cl = await price("clip");
  const input = {
    name: "테스트 캠페인",
    customerId: c.id,
    start: "2027-01-01",
    end: "2027-01-31",
    blog: 3,
    clip: 5,
    blogPriceId: b.id,
    clipPriceId: cl.id,
  };
  const draft = await saveQuote(input, actor);
  return { draft, input, b, cl };
}
test("계정·게시물 식별은 모바일·추적 파라미터·네이버 구형 URL을 통합한다", () => {
  assert.equal(
    accountIdentity("https://m.blog.naver.com/Example?ref=x"),
    accountIdentity("https://blog.naver.com/example"),
  );
  assert.equal(
    publicationIdentity("https://blog.naver.com/example/123?ref=x"),
    publicationIdentity(
      "https://m.blog.naver.com/PostView.naver?blogId=example&logNo=123",
    ),
  );
  assert.equal(
    publicationIdentity("https://instagram.com/reel/AbC/?igsh=x"),
    publicationIdentity("https://www.instagram.com/p/AbC/"),
  );
  assert.throws(() => publicationIdentity("javascript:alert(1)"));
  const weeks = weeklyTimeline("2027-01-01", "2027-01-31", 3, 5);
  assert.equal(
    weeks.reduce((n, w) => n + w.blog, 0),
    3,
  );
  assert.equal(
    weeks.reduce((n, w) => n + w.clip, 0),
    5,
  );
});
test("견적 확정은 중복 프로젝트를 만들지 않고 총수량·도장·두 PDF를 보존한다", async () => {
  const { draft } = await fixture();
  const results = await Promise.all([
    confirmQuote(draft.id, draft.version, actor),
    confirmQuote(draft.id, draft.version, actor),
  ]);
  assert.deepEqual(results[0], results[1]);
  const project = await get(String(results[0].projectId));
  assert.deepEqual(project?.orderedQuantities, { blog: 3, clip: 5 });
  assert.equal(
    (await list("tasks")).filter((t) => t.projectId === project!.id).length,
    8,
  );
  const workbook = await quoteWorkbook(draft);
  assert.equal(workbook.worksheets[0].getImages().length, 1);
  assert.equal(workbook.worksheets[0].getCell("C3").value, "테스트 고객");
  const pdf = await quotePDF(draft),
    proposal = await proposalPDF(draft);
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");
  assert.ok(proposal.length > 1000);
  if (process.env.WORKFLOW_ARTIFACT_DIR) {
    await mkdir(process.env.WORKFLOW_ARTIFACT_DIR, { recursive: true });
    await writeFile(process.env.WORKFLOW_ARTIFACT_DIR + "/quote.pdf", pdf);
    await writeFile(
      process.env.WORKFLOW_ARTIFACT_DIR + "/proposal.pdf",
      proposal,
    );
    await workbook.xlsx.writeFile(
      process.env.WORKFLOW_ARTIFACT_DIR + "/quote.xlsx",
    );
  }
  const slot = (await list("work_slots")).find(
    (s) => s.projectId === project!.id && s.type === "bundle",
  )!;
  await splitSlot(slot.id, actor);
  const tasks = (await list("tasks")).filter(
    (t) => t.projectId === project!.id,
  );
  assert.equal(tasks.filter((t) => t.channel === "blog").length, 3);
  assert.equal(tasks.filter((t) => t.channel === "clip").length, 5);
});
test("문서 검토 후 단가 변경 시 재검토를 요구한다", async () => {
  const { draft, b } = await fixture();
  await update(b.id, { sale: 20000 });
  await assert.rejects(
    confirmQuote(draft.id, draft.version, actor),
    /다시 저장/,
  );
});
test("신청 계정 중복은 다른 전화번호·주소 표기·동시 요청으로 우회할 수 없다", async () => {
  const url =
    "https://blog.naver.com/u" + crypto.randomUUID().replaceAll("-", "");
  const data = {
    name: "신청",
    phone: "010-3333-1234",
    payment: { method: "kakaopay" },
    accounts: [{ id: crypto.randomUUID(), channel: "blog", url }],
  };
  const results = await Promise.allSettled([
    submitApplication({ key: crypto.randomUUID(), consent: true, data }),
    submitApplication({
      key: crypto.randomUUID(),
      consent: true,
      data: {
        ...data,
        phone: "010-4444-1234",
        accounts: [{ ...data.accounts[0], url: url + "?ref=x" }],
      },
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("제안 수락·계정 중복·3일 검수·부분 지급·추천료 차액·포털 격리를 확인한다", async () => {
  const { draft } = await fixture();
  const confirmed = await confirmQuote(draft.id, draft.version, actor);
  const projectId = String(confirmed.projectId);
  const accounts = [
    {
      id: crypto.randomUUID(),
      channel: "blog",
      url:
        "https://blog.naver.com/worker" +
        crypto.randomUUID().replaceAll("-", ""),
      ownershipVerifiedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      channel: "clip",
      url: "https://m.naver.com/clip/profile/" + crypto.randomUUID(),
      ownershipVerifiedAt: new Date().toISOString(),
    },
  ];
  const ref = await save(
    "participants",
    { name: "추천인", phone: "01011112222" },
    actor,
  );
  const p = await save(
    "participants",
    { name: "작업자", phone: "01033334444", accounts },
    actor,
  );
  await changeReferrer(p.id, ref.id, "가입 추천 확인", actor);
  await assert.rejects(changeReferrer(ref.id, p.id, "순환", actor), /순환/);
  const slots = (await list("work_slots")).filter(
    (s) => s.projectId === projectId && s.type === "bundle",
  );
  const offer = await proposeWork(
    {
      slotId: slots[0].id,
      participantId: p.id,
      blogAccountId: accounts[0].id,
      clipAccountId: accounts[1].id,
    },
    actor,
  );
  await assert.rejects(respondOffer(offer.id, ref.id, true), /본인/);
  await respondOffer(offer.id, p.id, true);
  await assert.rejects(
    proposeWork(
      {
        slotId: slots[1].id,
        participantId: p.id,
        blogAccountId: accounts[0].id,
        clipAccountId: accounts[1].id,
      },
      actor,
    ),
    /이미 배정/,
  );
  const tasks = (await list("tasks")).filter(
    (t) => t.workSlotId === slots[0].id,
  );
  const blog = tasks.find((t) => t.channel === "blog")!;
  await update(blog.id, { status: "delivered" });
  await command(
    "publication",
    {
      id: blog.id,
      version: (await get(blog.id))!.version,
      link: accounts[0].url + "/123",
      verified: false,
    },
    actor,
    crypto.randomUUID(),
  );
  await assert.rejects(
    command(
      "publication",
      {
        id: blog.id,
        version: (await get(blog.id))!.version,
        link: accounts[0].url + "/123",
        verified: true,
      },
      actor,
      crypto.randomUUID(),
    ),
    /3일/,
  );
  await update(blog.id, {
    submittedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  });
  await command(
    "publication",
    {
      id: blog.id,
      version: (await get(blog.id))!.version,
      link: accounts[0].url + "/123",
      verified: true,
    },
    actor,
    crypto.randomUUID(),
  );
  assert.ok((await get(blog.id))!.retentionUntil);
  await partialPay(slots[0].id, blog.id, actor);
  await cancelPartialPay(slots[0].id, actor);
  assert.equal((await get(blog.id))!.payoutStatus, "pending");
  await partialPay(slots[0].id, blog.id, actor);
  assert.equal(
    (await list("referral_credits"))
      .filter((c) => c.participantId === ref.id)
      .reduce((n, c) => n + Number(c.amount), 0),
    500,
  );
  const clip = tasks.find((t) => t.channel === "clip")!;
  await update(clip.id, { status: "verified" });
  await command(
    "work-slot-pay",
    { id: slots[0].id, version: (await get(slots[0].id))!.version, paid: true },
    actor,
    crypto.randomUUID(),
  );
  assert.equal(
    (await list("referral_credits"))
      .filter((c) => c.participantId === ref.id)
      .reduce((n, c) => n + Number(c.amount), 0),
    1200,
  );
  const portal = await issuePortal(p.id, actor);
  const token = portal.url.split("access=")[1];

  await assert.rejects(portalParticipant(token));
  const parent = (await list("portal_links")).find(
    (l) => l.participantId === p.id && !l.revokedAt,
  )!;
  const session = randomBytes(32).toString("hex");
  await create("portal_links", {
    purpose: "session",
    participantId: p.id,
    parentId: parent.id,
    tokenHash: createHash("sha256").update(session).digest("hex"),
    verifiedPhone: String(p.phone || "").replace(/\D/g, ""),
    expiresAt: parent.expiresAt,
  });
  const person = await portalParticipant(session);
  const view = await portalView(person);
  assert.equal(view.participant.id, p.id);
  assert.equal(view.tasks.length, 2);
  assert.ok(!("phone" in view.participant));
  await issuePortal(p.id, actor);
  await assert.rejects(portalParticipant(session), /만료/);
});
test("SENS 서명은 결정적이고 템플릿 변수 누락은 거부한다", () => {
  assert.equal(
    sensSignature("POST", "/test", "1", "key", "secret"),
    sensSignature("POST", "/test", "1", "key", "secret"),
  );
  assert.throws(() => renderNotification("materials", { name: "테스트" }));
});

test("SENS는 중복 요청을 막고 수신 결과·불명확한 통신 오류를 구분한다", async () => {
  const keys = [
    "SENS_ENABLED",
    "NCP_ACCESS_KEY",
    "NCP_SECRET_KEY",
    "SENS_SERVICE_ID",
    "SENS_CHANNEL_ID",
    "APP_URL",
    "SENS_TEMPLATE_PAYMENT",
  ];
  const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const p = await save(
    "participants",
    { name: "알림 수신자", phone: "01055556666" },
    actor,
  );
  const source = await create("tasks", {
    name: "알림 작업",
    participantId: p.id,
    payoutStatus: "paid",
  });
  const n = await transaction(() =>
    queueNotification(p.id, "payment", source.id + ":paid", { name: "테스트" }),
  );
  const duplicate = await transaction(() =>
    queueNotification(p.id, "payment", source.id + ":paid", { name: "테스트" }),
  );
  assert.equal(duplicate.id, n.id);
  try {
    Object.assign(process.env, {
      SENS_ENABLED: "true",
      NCP_ACCESS_KEY: "test-key",
      NCP_SECRET_KEY: "test-secret",
      SENS_SERVICE_ID: "test-service",
      SENS_CHANNEL_ID: "@test",
      APP_URL: "https://example.com",
      SENS_TEMPLATE_PAYMENT: "test-payment",
    });
    let count = 0;
    globalThis.fetch = async (input, init) => {
      count++;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        assert.equal(body.messages[0].useSmsFailover, false);
        assert.equal(
          body.messages[0].buttons[0].linkMobile,
          "https://example.com/participants/portal",
        );
        return Response.json({
          requestId: "test-request",
          messages: [{ messageId: "test-message", requestStatusCode: "A000" }],
        });
      }
      return Response.json({
        messageStatusName: "success",
        messageStatusCode: "0000",
      });
    };
    await sendNotification(n.id);
    assert.equal((await get(n.id))!.status, "accepted");
    await assert.rejects(sendNotification(n.id), /발송 가능한/);
    assert.equal(count, 1);
    await refreshNotification(n.id);
    assert.equal((await get(n.id))!.status, "succeeded");
    // Regression: ISSUE-004 — AlimTalk exposes messageStatusName, not the SMS messageStatus field.
    // Found by /qa on 2026-10-19. Report: artifacts/final-workflow-qa.md
    for (const [messageStatusName, expected] of [
      ["processing", "accepted"],
      ["fail", "failed"],
      ["success", "succeeded"],
    ]) {
      globalThis.fetch = async (_input, init) => {
        assert.equal(
          init?.method,
          "GET",
          "status refresh must never resend a message",
        );
        return Response.json({
          messageStatusName,
          ...(messageStatusName === "processing"
            ? {}
            : {
                messageStatusCode:
                  messageStatusName === "success" ? "0000" : "3020",
                messageStatusDesc: "수신 결과",
              }),
        });
      };
      await refreshNotification(n.id);
      assert.equal((await get(n.id))!.status, expected);
    }
    const second = await transaction(() =>
      queueNotification(p.id, "payment", source.id + ":other", {
        name: "테스트",
      }),
    );
    globalThis.fetch = async () => {
      throw new Error("timeout");
    };
    await assert.rejects(sendNotification(second.id), /timeout/);
    assert.equal((await get(second.id))!.status, "uncertain");
    await assert.rejects(sendNotification(second.id), /발송 가능한/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  }
});
test("블로그 단독에서 묶음 전환은 수량을 유지하고 남은 클립을 원자적으로 확보한다", async () => {
  const { draft } = await fixture();
  const confirmed = await confirmQuote(draft.id, draft.version, actor);
  const projectId = String(confirmed.projectId);
  const bundle = (await list("work_slots")).find(
    (s) => s.projectId === projectId && s.type === "bundle",
  )!;
  await splitSlot(bundle.id, actor);
  const slots = (await list("work_slots")).filter(
    (s) => s.splitFrom === bundle.id,
  );
  const blog = slots.find((s) => s.type === "blog")!,
    clip = slots.find((s) => s.type === "clip")!;
  const account = {
    id: crypto.randomUUID(),
    channel: "blog",
    url:
      "https://blog.naver.com/upgrade" +
      crypto.randomUUID().replaceAll("-", ""),
    ownershipVerifiedAt: new Date().toISOString(),
  };
  const p = await save(
    "participants",
    { name: "묶음 전환", accounts: [account] },
    actor,
  );
  const offer = await proposeWork(
    { slotId: blog.id, participantId: p.id, blogAccountId: account.id },
    actor,
  );
  await respondOffer(offer.id, p.id, true);
  const result = await upgradeBundle(blog.id, clip.id, p.id, account.id);
  const merged = await get(result.slotId);
  assert.equal(merged?.type, "bundle");
  assert.equal(merged?.participantId, p.id);
  assert.equal(merged?.amount, 7000);
  assert.equal(
    (await list("tasks")).filter((t) => t.projectId === projectId).length,
    8,
  );
  await assert.rejects(upgradeBundle(blog.id, clip.id, p.id, account.id));
});
// Regression: ISSUE-003 — invalid product prices were accepted until final quote confirmation.
// Found by /qa on 2026-10-19. Report: artifacts/final-workflow-qa.md
test("quote draft rejects prices that the final campaign order cannot use", async () => {
  const f = await fixture();
  await update(f.b.id, { images: 1 });
  await assert.rejects(saveQuote(f.input, actor), /3장/);
  await update(f.b.id, { images: 3 });
  await update(f.cl.id, { duration: 15, mode: "slideshow" });
  await assert.rejects(saveQuote(f.input, actor), /10초/);
});
