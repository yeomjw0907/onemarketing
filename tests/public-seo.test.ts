import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicPages,
  publicMetadata,
  publicStructuredData,
  serializeStructuredData,
  siteUrl,
  type PublicPath,
  sitemapEntries,
  campaignStructuredData,
  campaignMetadata,
} from "../src/lib/public-seo";
import { serviceOfferings } from "../src/lib/service-offerings";
import type { CampaignSummary } from "../src/lib/campaign-display";
import robots from "../src/app/robots";

test("public pages have matching canonical, sharing metadata and structured URLs", () => {
  for (const path of Object.keys(publicPages) as PublicPath[]) {
    const url = new URL(path, siteUrl).href;
    const metadata = publicMetadata(path);
    assert.equal(metadata.alternates?.canonical, url);
    assert.equal((metadata.robots as { index: boolean }).index, true);
    assert.equal(metadata.openGraph?.title, metadata.title);
    const graph = publicStructuredData(path)["@graph"];
    assert.equal(graph.at(-1)?.url, url);
    assert.equal(graph.at(-1)?.name, metadata.title);
    assert.doesNotMatch(
      JSON.stringify(graph),
      /AggregateRating|Review|Offer|priceCurrency|SearchAction|FAQPage|HowTo/,
    );
  }
});
test("sitemap explicitly excludes private and token-bearing routes", () => {
  const urls = sitemapEntries().map((entry) => entry.url);
  assert.equal(urls.length, 7);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(
    urls,
    Object.keys(publicPages).map((path) => new URL(path, siteUrl).href),
  );
  for (const url of urls)
    assert.doesNotMatch(url, /login|signup|admin|portal|reports|\?|#/);
  assert.equal(robots().sitemap, `${siteUrl}/sitemap.xml`);
  assert.ok(sitemapEntries().every((entry) => !("lastModified" in entry)));
});
const campaign: CampaignSummary = {
  id: "12345678-1234-1234-1234-123456789abc",
  source: "commerce",
  title: "공개 캠페인",
  brand: "브랜드",
  category: "cafe",
  fulfillment: "provided",
  region: "서울",
  imageUrl: "",
  channel: "blog",
  quantity: 2,
  applicationCount: 0,
  reward: 20000,
  benefit: "공개 제공 혜택",
  deadline: "2027-11-01",
  submissionDeadline: "2027-11-20",
  status: "recruiting",
  createdAt: "2026-11-01",
  canApply: true,
  types: ["blog"],
};
test("services and breadcrumbs reflect visible cards without fabricated commercial facts", () => {
  for (const path of ["/about", "/marketing"] as const) {
    const graph = publicStructuredData(path)["@graph"];
    const services = graph.filter((n) => n["@type"] === "Service");
    assert.deepEqual(
      services.map((n) => n.name),
      serviceOfferings.map((s) => s.name),
    );
    assert.deepEqual(
      services.map((n) => n.description),
      serviceOfferings.map((s) => s.description),
    );
    const trail = graph.find((n) => n["@type"] === "BreadcrumbList") as any;
    assert.deepEqual(
      trail.itemListElement.map((i: any) => i.position),
      [1, 2],
    );
    assert.equal(trail.itemListElement.at(-1).item, siteUrl + path);
  }
  assert.equal(
    publicStructuredData("/marketing", { services: false })["@graph"].some(
      (n) => n["@type"] === "Service",
    ),
    false,
  );
});
test("campaign schema and sitemap use only public summary fields and eligible recruitment", () => {
  const hostile = {
    ...campaign,
    title: "</script><script>alert(1)</script>",
    privateGuide: "SECRET GUIDE",
    participantPhone: "01000000000",
  };
  const schema = campaignStructuredData(hostile);
  assert.ok(!serializeStructuredData(schema).includes("<"));
  assert.doesNotMatch(
    JSON.stringify(schema),
    /SECRET GUIDE|01000000000|Offer|price|JobPosting|Event/,
  );
  assert.equal((campaignMetadata(campaign).robots as any).index, true);
  assert.equal(
    (campaignMetadata({ ...campaign, canApply: false }).robots as any).index,
    false,
  );
  const closed = {
    ...campaign,
    id: "12345678-1234-1234-1234-123456789abd",
    status: "completed",
    canApply: false,
  };
  assert.equal(sitemapEntries([campaign, closed]).length, 8);
  const list = publicStructuredData("/campaigns", {
    campaigns: [closed, campaign],
  })["@graph"].find((n) => n["@type"] === "ItemList") as any;
  assert.equal(list.numberOfItems, 1);
  assert.equal(list.itemListElement[0].item.name, campaign.title);
  assert.equal(
    publicStructuredData("/campaigns", {
      campaigns: [campaign],
      campaignList: false,
    })["@graph"].some((n) => n["@type"] === "ItemList"),
    false,
  );
  const trail = schema["@graph"][0] as any;
  assert.deepEqual(
    trail.itemListElement.map((i: any) => i.position),
    [1, 2, 3],
  );
});
test("JSON-LD escapes closing script injection while preserving parsed content", () => {
  const hostile = {
    name: '</script><script>alert("x")</script>',
    text: "한글 & 텍스트",
  };
  const serialized = serializeStructuredData(hostile);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), hostile);
});
test("homepage defines a single organization and website with stable linked identifiers", () => {
  const graph = publicStructuredData("/")["@graph"];
  assert.equal(
    graph.filter((node) => node["@type"] === "Organization").length,
    1,
  );
  assert.equal(graph.filter((node) => node["@type"] === "WebSite").length, 1);
  assert.equal(graph[0]["@id"], `${siteUrl}/#organization`);
  assert.equal(graph[1]["@id"], `${siteUrl}/#website`);
});
