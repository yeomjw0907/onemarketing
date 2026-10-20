import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "./helpers";
import {
  createAssistantPairing,
  pairAssistantDevice,
  assistantDevice,
  heartbeatAssistant,
  createAssistantThread,
  enqueueAssistant,
  claimAssistant,
  completeAssistant,
  confirmAssistant,
  assistantStatus,
  cancelAssistant,
  dismissAssistant,
  disconnectAssistant,
  answerAssistantQuestion,
} from "../src/lib/assistant-chat";
import { list, query, execute, update } from "../src/lib/db";
import { save } from "../src/lib/domain";
import { POST as workerPost } from "../src/app/api/assistant/worker/route";
import {
  prepareAssistantQuestion,
  assistantQuestionAnswer,
} from "../src/lib/assistant-questions";
const owner = "assistant-test@local",
  other = "assistant-other@local";
const previous = process.env.ADMIN_USERS_JSON;
process.env.ADMIN_USERS_JSON = JSON.stringify([
  { email: owner },
  { email: other },
]);
after(() => {
  if (previous === undefined) delete process.env.ADMIN_USERS_JSON;
  else process.env.ADMIN_USERS_JSON = previous;
});
async function setup(email = owner) {
  const { code } = await createAssistantPairing(email);
  const p = await pairAssistantDevice({ code, name: "검수 PC" });
  const device = await assistantDevice(p.token);
  await heartbeatAssistant(device, "ready");
  const thread = await createAssistantThread(email);
  return { ...p, device, thread };
}
async function job(
  s: Awaited<ReturnType<typeof setup>>,
  message = "고객 등록을 준비해줘",
) {
  const req = { threadId: s.thread.id, requestId: randomUUID(), message };
  const turn = await enqueueAssistant(s.device.owner, req);
  const j = await claimAssistant(s.device);
  assert.ok(j);
  return { req, turn, job: j };
}
const output = (action: string, args: unknown) => ({
  reply: "아래 내용을 확인하고 저장해주세요.",
  action,
  argumentsJson: JSON.stringify(args),
});
test("guided questions use live catalog values and reject deleted items, foreign products and changed prices", async () => {
  const customer = await save("customers", { name: "선택형 고객" }, owner);
  const second = await save("customers", { name: "다른 선택형 고객" }, owner);
  const product = await save(
    "products",
    { name: "선택형 제품", customerId: customer.id },
    owner,
  );
  const otherProduct = await save(
    "products",
    { name: "다른 고객 제품", customerId: second.id },
    owner,
  );
  const q = await prepareAssistantQuestion(
    JSON.stringify({
      kind: "product",
      title: "제품을 골라주세요",
      customerId: customer.id,
    }),
  );
  assert.ok(q);
  assert.equal(
    q.options.some((o) => o.value === product.id),
    true,
  );
  assert.equal(
    q.options.some((o) => o.value === otherProduct.id),
    false,
  );
  await assert.rejects(assistantQuestionAnswer(q, [otherProduct.id]));
  assert.match(await assistantQuestionAnswer(q, [product.id]), /선택형 제품/);
  await update(product.id, { deletedAt: Date.now() });
  await assert.rejects(assistantQuestionAnswer(q, [product.id]));
  const price = await save(
    "prices",
    {
      name: "선택형 가격",
      channel: "blog",
      sale: 30000,
      payout: 4000,
      images: 3,
      aiEstimate: 1000,
      duration: 0,
      mode: "slideshow",
      revisions: 1,
    },
    owner,
  );
  const pq = await prepareAssistantQuestion(
    JSON.stringify({ kind: "price", title: "상품 선택", channel: "blog" }),
  );
  assert.ok(pq);
  await update(price.id, { sale: 40000 });
  await assert.rejects(assistantQuestionAnswer(pq, [price.id]));
  const dates = await prepareAssistantQuestion(
    '{"kind":"dates","title":"게시 기간"}',
  );
  assert.ok(dates);
  await assert.rejects(
    assistantQuestionAnswer(dates, ["2030-02-30", "2030-03-01"]),
  );
  await assert.rejects(
    assistantQuestionAnswer(dates, ["2030-03-02", "2030-03-01"]),
  );
  const quantities = await prepareAssistantQuestion(
    '{"kind":"quantities","title":"수량"}',
  );
  assert.ok(quantities);
  await assert.rejects(
    prepareAssistantQuestion(
      '{"kind":"choice","title":"중복 선택","options":["동일","동일"]}',
    ),
  );
  await assert.rejects(assistantQuestionAnswer(quantities, ["100", "1"]));
  await assert.rejects(assistantQuestionAnswer(quantities, ["0", "0"]));
  assert.match(
    await assistantQuestionAnswer(quantities, ["30", "30"]),
    /블로그 30개, 클립 30개/,
  );
});

test("guided answers are owner-bound, one-time, retry-safe and never save business records", async () => {
  const s = await setup(),
    j = await job(s, "캠페인을 준비하자");
  const before = (await list("customers")).length;
  await completeAssistant(s.device, {
    id: j.turn.id,
    lease: j.job.lease,
    output: {
      ...output("none", {}),
      questionJson: '{"kind":"channels","title":"어떤 콘텐츠를 준비할까요?"}',
    },
  });
  const req = {
    id: j.turn.id,
    requestId: randomUUID(),
    values: ["blog", "clip"],
  };
  await assert.rejects(answerAssistantQuestion(other, req));
  await assert.rejects(
    answerAssistantQuestion(owner, { ...req, values: ["invalid"] }),
  );
  const answer = await answerAssistantQuestion(owner, req);
  assert.deepEqual(await answerAssistantQuestion(owner, req), answer);
  await assert.rejects(
    answerAssistantQuestion(owner, { ...req, requestId: randomUUID() }),
  );
  const turns = (await assistantStatus(owner, s.thread.id)).turns;
  assert.equal(turns.length, 2);
  assert.match(turns[1].input, /블로그, 클립/);
  assert.equal((await list("customers")).length, before);
  await cancelAssistant(owner, answer.id);
  const customer = await save(
    "customers",
    { name: "선택 표시 검수 고객" },
    owner,
  );
  const k = await job(s, "고객을 선택하자");
  await completeAssistant(s.device, {
    id: k.turn.id,
    lease: k.job.lease,
    output: {
      ...output("none", {}),
      questionJson: '{"kind":"customer","title":"고객을 골라주세요"}',
    },
  });
  const choiceRequest = {
    id: k.turn.id,
    requestId: randomUUID(),
    values: [customer.id],
  };
  const chosen = await answerAssistantQuestion(owner, choiceRequest);
  await update(customer.id, { name: "이름 변경 후 재시도" });
  assert.deepEqual(await answerAssistantQuestion(owner, choiceRequest), chosen);
  await assert.rejects(
    answerAssistantQuestion(owner, { ...choiceRequest, values: ["forged"] }),
  );
  const visible = (await assistantStatus(owner, s.thread.id)).turns.at(-1)!;
  assert.match(visible.input, /선택 표시 검수 고객/);
  assert.equal(visible.input.includes(customer.id), false);
  const [raw] = await query<{ input: string }>(
    "select input from assistant_turns where id=$1",
    [chosen.id],
  );
  assert.equal(raw.input.includes(customer.id), true);
  await cancelAssistant(owner, chosen.id);
});

test("dashboard expires abandoned requests even without a connected worker and permits a fresh request", async () => {
  const s = await setup(),
    j = await job(s);
  await execute("update assistant_turns set lease_until=0 where id=$1", [
    j.turn.id,
  ]);
  assert.equal(
    (await assistantStatus(owner, s.thread.id)).turns.at(-1)?.status,
    "failed",
  );
  const q = await enqueueAssistant(owner, {
    threadId: s.thread.id,
    requestId: randomUUID(),
    message: "오래된 대기 요청",
  });
  await execute("update assistant_turns set created_at=$2 where id=$1", [
    q.id,
    Date.now() - 301000,
  ]);
  assert.equal(
    (await assistantStatus(owner, s.thread.id)).turns.find((t) => t.id === q.id)
      ?.status,
    "failed",
  );
  const next = await job(s, "새 요청");
  assert.ok(next.job);
  await cancelAssistant(owner, next.turn.id);
});

test("natural-language followups supersede question buttons and invalid questions fall back to text", async () => {
  const s = await setup(),
    j = await job(s, "고객 선택");
  await completeAssistant(s.device, {
    id: j.turn.id,
    lease: j.job.lease,
    output: {
      ...output("none", {}),
      questionJson: '{"kind":"channels","title":"콘텐츠 선택"}',
    },
  });
  const next = await enqueueAssistant(owner, {
    threadId: s.thread.id,
    requestId: randomUUID(),
    message: "선택 대신 블로그만 3개로 할게",
  });
  await assert.rejects(
    answerAssistantQuestion(owner, {
      id: j.turn.id,
      requestId: randomUUID(),
      values: ["blog"],
    }),
  );
  await cancelAssistant(owner, next.id);
  const k = await job(s);
  await completeAssistant(s.device, {
    id: k.turn.id,
    lease: k.job.lease,
    output: {
      ...output("none", {}),
      questionJson:
        '{"kind":"product","title":"제품 선택","customerId":"not-real"}',
    },
  });
  const last = (await assistantStatus(owner, s.thread.id)).turns.at(-1)!;
  assert.equal(last.question, null);
  assert.ok(last.reply);
});
test("PC pairing is one-use, hashes machine tokens, and never exposes credentials in dashboard status", async () => {
  const { code } = await createAssistantPairing(owner);
  const paired = await pairAssistantDevice({ code, name: "내 PC" });
  await assert.rejects(pairAssistantDevice({ code, name: "다른 PC" }));
  const text = JSON.stringify(await query("select * from assistant_devices"));
  assert.equal(text.includes(paired.token), false);
  assert.equal(
    JSON.stringify(await assistantStatus(owner)).includes(paired.token),
    false,
  );
  await assert.rejects(assistantDevice("forged"));
  const d = await assistantDevice(paired.token);
  await disconnectAssistant(owner, d.id);
  await assert.rejects(assistantDevice(paired.token));
  const unauth = await workerPost(
    new Request("https://example.test/api/assistant/worker", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(unauth.status, 401);
});
test("offline requests are blocked; lease claims and message retries stay bound to the correct administrator", async () => {
  const s = await setup();
  await execute("update assistant_devices set last_seen=0 where owner=$1", [
    owner,
  ]);
  await assert.rejects(
    enqueueAssistant(owner, {
      threadId: s.thread.id,
      requestId: randomUUID(),
      message: "확인",
    }),
  );
  await heartbeatAssistant(s.device, "ready");
  const j = await job(s);
  const again = await enqueueAssistant(owner, j.req);
  assert.equal(again.id, j.turn.id);
  await assert.rejects(
    enqueueAssistant(owner, { ...j.req, message: "다른 내용" }),
  );
  assert.equal(await claimAssistant(s.device), null);
  const b = await setup(other);
  await assert.rejects(
    enqueueAssistant(other, {
      threadId: s.thread.id,
      requestId: randomUUID(),
      message: "다른 계정",
    }),
  );
  await assert.rejects(
    completeAssistant(b.device, {
      id: j.turn.id,
      lease: j.job.lease,
      output: output("none", {}),
    }),
  );
  await cancelAssistant(owner, j.turn.id);
  await assert.rejects(
    completeAssistant(s.device, {
      id: j.turn.id,
      lease: j.job.lease,
      output: output("none", {}),
    }),
  );
});
test("model proposals cannot save; only the owning administrator can confirm, once", async () => {
  const s = await setup(),
    j = await job(s);
  const before = (await list("customers")).length;
  await completeAssistant(s.device, {
    id: j.turn.id,
    lease: j.job.lease,
    output: output("create_customer", {
      name: "확인 카드 고객",
      brand: "검수",
    }),
  });
  assert.equal((await list("customers")).length, before);
  await assert.rejects(confirmAssistant(other, j.turn.id));
  const [a, b] = (await Promise.all([
    confirmAssistant(owner, j.turn.id),
    confirmAssistant(owner, j.turn.id),
  ])) as any[];
  assert.equal(a.record.id, b.record.id);
  assert.equal((await list("customers")).length, before + 1);
  assert.equal(
    (await assistantStatus(owner, s.thread.id)).turns[0].proposal_status,
    "saved",
  );
});
test("dismissed and superseded cards cannot be saved; invalid model fields and forbidden actions never create data", async () => {
  const s = await setup(),
    j = await job(s);
  await completeAssistant(s.device, {
    id: j.turn.id,
    lease: j.job.lease,
    output: output("create_customer", { name: "취소할 카드" }),
  });
  await dismissAssistant(owner, j.turn.id);
  await assert.rejects(confirmAssistant(owner, j.turn.id));
  const k = await job(s);
  await completeAssistant(s.device, {
    id: k.turn.id,
    lease: k.job.lease,
    output: output("create_customer", { name: "이전 카드" }),
  });
  const next = await enqueueAssistant(owner, {
    threadId: s.thread.id,
    requestId: randomUUID(),
    message: "이름을 수정할게",
  });
  await assert.rejects(confirmAssistant(owner, k.turn.id));
  const claimed = await claimAssistant(s.device);
  assert.ok(claimed);
  assert.equal(claimed.id, next.id);
  await assert.rejects(
    completeAssistant(s.device, {
      id: next.id,
      lease: claimed.lease,
      output: output("send_kakao", {}),
    }),
  );
  await completeAssistant(s.device, {
    id: next.id,
    lease: claimed.lease,
    output: output("create_customer", { name: "숨은 승인", confirmed: true }),
  });
  const last = (await assistantStatus(owner, s.thread.id)).turns.at(-1)!;
  assert.equal(last.proposal, null);
  await assert.rejects(confirmAssistant(owner, last.id));
});
test("campaign card reuses quote validation and rejects changed prices before saving; downstream workflow stays untouched", async () => {
  const s = await setup();
  const c = await save("customers", { name: "캠페인 확인 고객" }, owner),
    p = await save("products", { name: "제품", customerId: c.id }, owner),
    price = await save(
      "prices",
      {
        name: "블로그",
        channel: "blog",
        sale: 30000,
        payout: 4000,
        aiEstimate: 1000,
        images: 3,
        duration: 0,
        mode: "slideshow",
        revisions: 1,
      },
      owner,
    );
  const scope = [
    "contracts",
    "projects",
    "jobs",
    "work_offers",
    "notification_outbox",
  ] as const;
  const counts = await Promise.all(
    scope.map(async (k) => (await list(k)).length),
  );
  const j = await job(s);
  const args = {
    name: "초안 확인",
    customerId: c.id,
    productId: p.id,
    start: "2030-01-01",
    end: "2030-01-31",
    blog: 2,
    clip: 0,
    blogPriceId: price.id,
  };
  await completeAssistant(s.device, {
    id: j.turn.id,
    lease: j.job.lease,
    output: output("create_campaign_draft", args),
  });
  await update(price.id, { sale: 35000 });
  await assert.rejects(confirmAssistant(owner, j.turn.id));
  assert.equal((await list("quote_drafts")).length, 0);
  const k = await job(s);
  await completeAssistant(s.device, {
    id: k.turn.id,
    lease: k.job.lease,
    output: output("create_campaign_draft", args),
  });
  const result = (await confirmAssistant(owner, k.turn.id)) as any;
  assert.equal(result.status, "draft");
  assert.equal(result.supply, 70000);
  assert.deepEqual(
    await Promise.all(scope.map(async (kind) => (await list(kind)).length)),
    counts,
  );
});
test("expired leases and disconnected machines cannot complete or secretly retry a request", async () => {
  const s = await setup(),
    j = await job(s);
  await execute("update assistant_turns set lease_until=0 where id=$1", [
    j.turn.id,
  ]);
  await assert.rejects(
    completeAssistant(s.device, {
      id: j.turn.id,
      lease: j.job.lease,
      output: output("none", {}),
    }),
  );
  assert.equal(await claimAssistant(s.device), null);
  assert.equal(
    (await assistantStatus(owner, s.thread.id)).turns[0].status,
    "failed",
  );
  const k = await job(s);
  await disconnectAssistant(owner, s.device.id);
  await assert.rejects(assistantDevice(s.token));
  await assert.rejects(
    completeAssistant(s.device, {
      id: k.turn.id,
      lease: k.job.lease,
      output: output("create_customer", { name: "늦은 등록" }),
    }),
  );
});
