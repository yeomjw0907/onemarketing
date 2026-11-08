import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicPages,
  publicMetadata,
  publicStructuredData,
  serializeStructuredData,
  siteUrl,
  type PublicPath,
} from "../src/lib/public-seo";
import sitemap from "../src/app/sitemap";
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
  const urls = sitemap().map((entry) => entry.url);
  assert.equal(urls.length, 7);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(
    urls,
    Object.keys(publicPages).map((path) => new URL(path, siteUrl).href),
  );
  for (const url of urls)
    assert.doesNotMatch(url, /login|signup|admin|portal|reports|\?|#/);
  assert.equal(robots().sitemap, `${siteUrl}/sitemap.xml`);
  assert.ok(sitemap().every((entry) => !entry.lastModified));
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
