import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "./helpers";
import { execute } from "../src/lib/db";
import {
  publicCampaignCatalog,
  publicCampaignSummary,
} from "../src/lib/public-campaign-data";
import { campaignMetadata, publicStructuredData } from "../src/lib/public-seo";
import sitemap from "../src/app/sitemap";
test("anonymous SEO never exposes unpaid, preview or private campaign content; closed pages remain noindex", async () => {
  const account = randomUUID();
  await execute(
    "insert into advertiser_accounts(id,email,password_hash,name,phone) values($1,'seo@qa.local','hash','PRIVATE NAME','01011111111')",
    [account],
  );
  const ids: Record<string, string> = {};
  for (const mode of ["public", "preview", "unpaid", "completed"]) {
    const order = randomUUID(),
      id = randomUUID();
    ids[mode] = id;
    await execute(
      "insert into commerce_orders(id,advertiser_id,request_hash,data) values($1,$2,'qa',$3::jsonb)",
      [
        order,
        account,
        JSON.stringify({
          status: mode === "unpaid" ? "awaiting_payment" : "paid",
        }),
      ],
    );
    await execute(
      "insert into commerce_campaigns(id,order_id,data) values($1,$2,$3::jsonb)",
      [
        id,
        order,
        JSON.stringify({
          status: mode === "completed" ? "completed" : "recruiting",
          input: {
            title: mode + " 캠페인",
            brand: "공개 브랜드",
            channel: "blog",
            kind: "self",
            visibility: mode === "preview" ? "preview" : "public",
            quantity: 2,
            reward: 20000,
            deadline: "2099-12-01",
            submissionDeadline: "2099-12-31",
            guide: "PRIVATE GUIDE DO NOT INDEX",
            product: "PRIVATE PRODUCT DETAIL",
          },
          terms: { secret: "PRIVATE TERMS" },
          internalNote: "PRIVATE NOTE",
        }),
      ],
    );
  }
  const catalog = await publicCampaignCatalog();
  assert.deepEqual(
    catalog.campaigns.map((c) => c.id).sort(),
    [ids.public, ids.completed].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(catalog),
    /PRIVATE GUIDE|PRIVATE PRODUCT|PRIVATE TERMS|PRIVATE NOTE|01011111111|seo@qa.local/,
  );
  assert.equal(await publicCampaignSummary("not-a-uuid"), null);
  assert.equal(await publicCampaignSummary(ids.preview), null);
  assert.equal(await publicCampaignSummary(ids.unpaid), null);
  const active = (await publicCampaignSummary(ids.public.toUpperCase()))!;
  assert.equal(active.id, ids.public);
  assert.equal((campaignMetadata(active).robots as any).index, true);
  assert.equal(
    (
      campaignMetadata((await publicCampaignSummary(ids.completed))!)
        .robots as any
    ).index,
    false,
  );
  const urls = (await sitemap()).map((s) => s.url);
  assert.equal(urls.length, 8);
  assert.ok(urls.some((url) => url.endsWith(ids.public)));
  for (const id of [ids.preview, ids.unpaid, ids.completed])
    assert.equal(
      urls.some((url) => url.endsWith(id)),
      false,
    );
  const schema = JSON.stringify(
    publicStructuredData("/campaigns", { campaigns: catalog.campaigns }),
  );
  assert.ok(schema.includes(ids.public));
  assert.ok(!schema.includes(ids.completed));
});
