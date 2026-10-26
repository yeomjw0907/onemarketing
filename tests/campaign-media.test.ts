import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import sharp from "sharp";
import {
  saveCampaignImage,
  checkCampaignMedia,
  campaignImageRecord,
} from "../src/lib/campaign-media";
import { advertiserAuth } from "../src/lib/market";
import {
  checkout,
  savePaymentSettings,
  confirmPayment,
} from "../src/lib/commerce";
import { campaignQuote, policyVersion } from "../src/lib/commerce-policy";
import { getObject } from "../src/lib/storage";
const admin = { role: "admin" as const, id: "media-admin@test.local" };
test("campaign covers are transcoded, owner isolated, private until paid and validated at checkout", async () => {
  const auth = await advertiserAuth(
    {
      action: "register",
      email: crypto.randomUUID() + "@test.local",
      password: "strong-password-123",
      name: "대표 이미지",
      phone: "01012345678",
      consent: true,
    },
    crypto.randomUUID(),
  );
  const owner = auth.account.id;
  await assert.rejects(() =>
    saveCampaignImage(owner, Buffer.from("<svg>untrusted</svg>")),
  );
  await assert.rejects(() =>
    saveCampaignImage(owner, Buffer.alloc(3 * 1024 * 1024 + 1)),
  );
  const input = await sharp({
    create: { width: 60, height: 40, channels: 3, background: "#3182f6" },
  })
    .png()
    .toBuffer();
  const saved = await saveCampaignImage(owner, input);
  assert.equal(await campaignImageRecord(saved.id, null), null);
  const image = await campaignImageRecord(saved.id, owner);
  assert.ok(image);
  assert.equal(
    (await sharp(await getObject(String(image.storageName))).metadata()).format,
    "webp",
  );
  assert.equal(await campaignImageRecord(saved.id, "other-owner"), null);
  await assert.rejects(() => checkCampaignMedia(saved.url, "other-owner"));
  await checkCampaignMedia(saved.url, owner);
  await savePaymentSettings(admin, {
    enabled: true,
    bank: "테스트 은행",
    account: "123-4567",
    holder: "테스트",
  });
  const d = {
    title: "이미지 공개 검증",
    brand: "테스트",
    product: "제품",
    guide: "제공 자료와 캠페인 약정을 확인해주세요.",
    kind: "self_cash" as const,
    channel: "blog" as const,
    quantity: 1,
    reward: 20000,
    benefit: "",
    managed: false,
    deadline: "2027-11-01",
    submissionDeadline: "2027-11-15",
    imageUrl: saved.url,
  };
  const order = await checkout(owner, {
    id: crypto.randomUUID(),
    campaigns: [d],
    expectedTotal: campaignQuote(d).total,
    policyVersion,
    consent: true,
  });
  assert.equal(await campaignImageRecord(saved.id, null), null);
  await confirmPayment(
    admin,
    order.id,
    order.version,
    "media payment verification",
  );
  assert.ok(await campaignImageRecord(saved.id, null));
  assert.equal(await campaignImageRecord("not-an-id", owner), null);
});
