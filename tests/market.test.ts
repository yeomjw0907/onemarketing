import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import {
  advertiserAuth,
  advertiserSession,
  advertiserLogout,
  publicProducts,
  orderProduct,
  advertiserOrders,
  marketAdmin,
  marketAdminView,
  publicCampaigns,
  applyCampaign,
  myApplications,
  withdrawApplication,
  marketEntry,
} from "../src/lib/market";
import { save } from "../src/lib/domain";
import { get, list, update, query } from "../src/lib/db";
import { confirmQuote } from "../src/lib/quote-workflow";
import { proposeWork, respondOffer } from "../src/lib/work-offers";
const actor = "market-admin@test.local";
let serial = 0;
async function account() {
  return advertiserAuth(
    {
      action: "register",
      companyName: "테스트 업체",
      brand: "테스트 브랜드",
      industry: "생활용품",
      businessType: "preparing",
      businessNumber: "",
      address: "서울",
      description: "테스트 제품과 서비스",
      email: `advertiser-${crypto.randomUUID()}@test.local`,
      password: "a-strong-password",
      name: "테스트 광고주",
      phone: "01012345678",
      consent: true,
    },
    "test-" + ++serial,
  );
}
async function catalog(type = "blog", published = true) {
  const blog = await save(
    "prices",
    {
      name: "블로그",
      channel: "blog",
      sale: 10000,
      payout: 3000,
      aiEstimate: 6500,
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
      name: "클립",
      channel: "clip",
      sale: 20000,
      payout: 3000,
      aiEstimate: 10000,
      duration: 10,
      images: 0,
      mode: "generated",
      revisions: 1,
    },
    actor,
  );
  const row = await marketAdmin(
    {
      action: "catalog",
      data: {
        title: "공개 상품",
        description: "상품 설명",
        details: "원고 1개·이미지 3장, 제작 후 게시. 일정 확인 후 진행합니다.",
        type,
        blogPriceId: blog.id,
        clipPriceId: clip.id,
        published,
      },
    },
    actor,
  );
  return { row, blog, clip };
}
function order(row: any, unit = 10000) {
  return {
    id: crypto.randomUUID(),
    catalogId: row.id,
    catalogVersion: row.version,
    expectedUnit: unit,
    quantity: 1,
    brand: "브랜드",
    product: "제품",
    productUrl: "https://example.com/product",
    start: "2027-01-01",
    end: "2027-01-31",
    notes: "홍보 요청",
    consent: true,
  };
}
async function campaign(quantity = 1) {
  const a = await account(),
    c = await catalog(),
    r = await orderProduct(a.account.id, { ...order(c.row), quantity });
  const converted = await marketAdmin(
    { action: "convert", id: r.id, version: r.version },
    actor,
  );
  const q = (await get(converted.data.quoteId))!;
  const confirmed = await confirmQuote(q.id, q.version, actor);
  const p = (await get(String(confirmed.projectId)))!;
  const pub = await marketAdmin(
    {
      action: "campaign",
      data: {
        projectId: p.id,
        title: "공개 모집",
        description: "게시 참여자를 모집합니다.",
        guide: "제공 콘텐츠 게시·링크 제출·90일 유지·검수 후 지급",
        deadline: "2027-01-20",
        published: true,
      },
    },
    actor,
  );
  return { a, c, r, converted, q, p, pub };
}
async function participant() {
  const key = crypto.randomUUID();
  const p = await save(
    "participants",
    {
      name: "참여자",
      phone: "010" + String(++serial).padStart(8, "0"),
      payment: { method: "kakaopay" },
      accounts: [
        {
          id: crypto.randomUUID(),
          channel: "blog",
          url: "https://blog.naver.com/" + key,
          approvalStatus: "approved",
        },
      ],
    },
    actor,
  );
  const accounts = (p.accounts as any[]).map((a) => ({
    ...a,
    ownershipVerifiedAt: new Date().toISOString(),
  }));
  return update(p.id, { accounts });
}
test("광고주 계정은 동의·비밀번호를 검사하며 별도 세션과 소유권을 유지한다", async () => {
  await assert.rejects(
    advertiserAuth(
      {
        action: "register",
        companyName: "테스트 업체",
        brand: "테스트 브랜드",
        industry: "생활용품",
        businessType: "preparing",
        businessNumber: "",
        address: "서울",
        description: "테스트 제품과 서비스",
        email: "bad@test.local",
        password: "long-enough-password",
        name: "미동의",
        phone: "01012345678",
      },
      "test",
    ),
  );
  const a = await account();
  assert.equal((await advertiserSession(a.token))?.id, a.account.id);
  assert.equal(await advertiserSession("fake"), null);
  await advertiserLogout(a.token);
  assert.equal(await advertiserSession(a.token), null);
  assert.equal((await advertiserOrders(a.account.id)).length, 0);
});
test("상품은 명시적으로 공개하고 판매가만 내보내며 잘못된 단가를 차단한다", async () => {
  const c = await catalog("bundle", false);
  assert.ok(!(await publicProducts()).some((p) => p!.id === c.row.id));
  const shown = await marketAdmin(
    {
      action: "catalog",
      id: c.row.id,
      version: c.row.version,
      data: { ...c.row.data, published: true },
    },
    actor,
  );
  const dto = (await publicProducts()).find((p) => p!.id === shown.id)!;
  assert.equal(dto.unit, 30000);
  assert.ok(
    !("payout" in dto) &&
      !("cost" in dto) &&
      !("margin" in dto) &&
      !("blogPriceId" in dto),
  );
  await assert.rejects(
    marketAdmin(
      { action: "catalog", data: { ...shown.data, blogPriceId: c.clip.id } },
      actor,
    ),
    /단가/,
  );
});
test("신청 가격 변조·동시 중복을 막고 실제 견적·계약·슬롯까지 연결한다", async () => {
  const a = await account(),
    other = await account(),
    c = await catalog("bundle"),
    input = { ...order(c.row, 30000), quantity: 2 };
  await assert.rejects(
    orderProduct(a.account.id, { ...input, expectedUnit: 1 }),
    /가격/,
  );
  const [x, y] = await Promise.all([
    orderProduct(a.account.id, input),
    orderProduct(a.account.id, input),
  ]);
  assert.equal(x.id, y.id);
  assert.equal(x.data.total, 66000);
  assert.equal((await advertiserOrders(other.account.id)).length, 0);
  assert.equal((await advertiserOrders(a.account.id)).length, 1);
  const b = { action: "convert", id: x.id, version: x.version };
  const [one, two] = await Promise.all([
    marketAdmin(b, actor),
    marketAdmin(b, actor),
  ]);
  assert.equal(one.data.quoteId, two.data.quoteId);
  const q = (await get(one.data.quoteId))!;
  assert.equal(q.supply, 60000);
  const result = await confirmQuote(q.id, q.version, actor);
  assert.equal(
    (await list("work_slots")).filter((s) => s.projectId === result.projectId)
      .length,
    2,
  );
  const own = await advertiserOrders(a.account.id);
  assert.ok(own[0].project);
  assert.ok(!JSON.stringify(own).includes("margin"));
});
test("신청 후 가격이 바뀌면 견적 전환을 롤백하고 접수 금액을 보존한다", async () => {
  const a = await account(),
    c = await catalog(),
    r = await orderProduct(a.account.id, order(c.row));
  await update(c.blog.id, { sale: 12000 });
  await assert.rejects(
    marketAdmin({ action: "convert", id: r.id, version: r.version }, actor),
    /단가/,
  );
  const fresh = await marketEntry(r.id, "request");
  assert.equal(fresh.data.status, "new");
  assert.equal(fresh.data.total, 11000);
  assert.equal(
    (
      await query<any>(
        "select customer_id from advertiser_accounts where id=$1",
        [a.account.id],
      )
    )[0].customer_id,
    a.account.customer_id,
  );
});
test("공개 지원은 회원·계정·중복·철회를 검사하고 선정 후 기존 수락으로 배정한다", async () => {
  const { pub, p } = await campaign(),
    member = await participant();
  const account = (member.accounts as any[])[0];
  const input = {
    campaignId: pub.id,
    type: "blog",
    blogAccountId: account.id,
    message: "지원합니다",
    consent: true,
  };
  await assert.rejects(
    applyCampaign(member.id, { ...input, blogAccountId: crypto.randomUUID() }),
    /승인 계정/,
  );
  const r = await applyCampaign(member.id, input);
  await assert.rejects(applyCampaign(member.id, input), /이미 지원/);
  await assert.rejects(
    withdrawApplication(crypto.randomUUID(), r.id, r.version),
    /본인/,
  );
  await withdrawApplication(member.id, r.id, r.version);
  const again = await applyCampaign(member.id, input);
  assert.equal(r.id, again.id);
  const chosen = await marketAdmin(
    { action: "select", id: again.id, version: again.version },
    actor,
  );
  assert.equal((await myApplications(member.id))[0].status, "proposed");
  assert.equal(
    (await list("work_slots")).filter(
      (s) => s.projectId === p.id && s.participantId,
    ).length,
    0,
  );
  await respondOffer(chosen.data.offerId, member.id, true);
  assert.equal((await myApplications(member.id))[0].status, "accepted");
  assert.equal(
    (await list("work_slots")).filter(
      (s) => s.projectId === p.id && s.participantId === member.id,
    ).length,
    1,
  );
  assert.equal(
    (await publicCampaigns()).find((c) => c!.id === pub.id)!.remaining,
    0,
  );
});
test("추천 제안과 공개 모집은 같은 정원을 사용하고 동시에 선정해도 한 자리만 예약한다", async () => {
  const { pub } = await campaign(),
    a = await participant(),
    b = await participant();
  const apply = (p: any) =>
    applyCampaign(p.id, {
      campaignId: pub.id,
      type: "blog",
      blogAccountId: p.accounts[0].id,
      consent: true,
    });
  const ra = await apply(a),
    rb = await apply(b);
  const outcomes = await Promise.allSettled([
    marketAdmin({ action: "select", id: ra.id, version: ra.version }, actor),
    marketAdmin({ action: "select", id: rb.id, version: rb.version }, actor),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  const c = (await publicCampaigns()).find((c) => c!.id === pub.id)!;
  assert.equal(c.remaining, 0);
  await assert.rejects(
    applyCampaign(a.id, {
      campaignId: pub.id,
      type: "blog",
      blogAccountId: (a.accounts as any[])[0].id,
      consent: true,
    }),
    /자리|제안|지원/,
  );
});
test("비공개·기한 종료·보류 캠페인에는 지원하지 못하고 다른 회원 내역은 보이지 않는다", async () => {
  const { pub, p } = await campaign(),
    a = await participant(),
    b = await participant();
  await update(p.id, { hold: true });
  assert.ok(!(await publicCampaigns()).some((c) => c!.id === pub.id));
  await assert.rejects(
    applyCampaign(a.id, {
      campaignId: pub.id,
      type: "blog",
      blogAccountId: (a.accounts as any[])[0].id,
      consent: true,
    }),
    /마감|자리/,
  );
  assert.deepEqual(await myApplications(b.id), []);
  assert.ok(
    (await marketAdminView()).advertisers.every((a) => !("password_hash" in a)),
  );
});

test("추천 제안의 예약·만료와 공개 모집 정원은 함께 바뀐다", async () => {
  const { pub, p } = await campaign();
  const member = await participant();
  const slot = (await list("work_slots")).find((s) => s.projectId === p.id)!;
  const offer = await proposeWork(
    {
      slotId: slot.id,
      participantId: member.id,
      blogAccountId: (member.accounts as any[])[0].id,
    },
    actor,
  );
  assert.equal(
    (await publicCampaigns()).find((c) => c!.id === pub.id)!.remaining,
    0,
  );
  await update(offer.id, { expiresAt: "2000-01-01T00:00:00Z" });
  assert.equal(
    (await publicCampaigns()).find((c) => c!.id === pub.id)!.remaining,
    1,
  );
  await marketAdmin(
    {
      action: "campaign",
      id: pub.id,
      version: pub.version,
      data: { ...pub.data, published: false },
    },
    actor,
  );
  assert.ok(!(await publicCampaigns()).some((c) => c!.id === pub.id));
  await assert.rejects(
    applyCampaign(member.id, {
      campaignId: pub.id,
      type: "blog",
      blogAccountId: (member.accounts as any[])[0].id,
      consent: true,
    }),
    /마감|자리/,
  );
});

test("다른 고객의 제품으로 전환하지 못하고 변경된 견적에서 다른 고객 정보가 노출되지 않는다", async () => {
  const a = await account(),
    c = await catalog(),
    r = await orderProduct(a.account.id, order(c.row));
  const customer = await save("customers", { name: "다른 업체" }, actor);
  const product = await save(
    "products",
    { name: "다른 제품", customerId: customer.id },
    actor,
  );
  await assert.rejects(
    marketAdmin(
      {
        action: "convert",
        id: r.id,
        version: r.version,
        data: { productId: product.id },
      },
      actor,
    ),
    /속한 제품/,
  );
  assert.equal((await marketEntry(r.id, "request")).data.status, "new");
  const converted = await marketAdmin(
    { action: "convert", id: r.id, version: r.version },
    actor,
  );
  await update(converted.data.quoteId, { customerId: customer.id });
  const orders = await advertiserOrders(a.account.id);
  assert.equal(orders[0].quote, null);
  assert.equal(orders[0].project, null);
});
