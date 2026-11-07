import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mediaGuidance, briefingPrompt } from "../src/lib/media-guidance";
import {
  blogPosterSchema,
  BLOG_IMAGE_POLICY_VERSION,
} from "../src/lib/blog-image-policy";
import { composeBlogPoster } from "../src/lib/blog-poster";

const poster = {
  headline: "향을 담은 작은 순간",
  productName: "샘플 디퓨저",
  price: "12,000원",
  brand: "검증 브랜드",
  palette: "ivory" as const,
  confirmed: true,
};
test("blog composition policy is included only in blog image guidance, preserving the video policy", () => {
  assert.match(
    mediaGuidance({ shootingTarget: "product" }, false, "blog"),
    new RegExp(BLOG_IMAGE_POLICY_VERSION),
  );
  assert.match(
    mediaGuidance({ shootingTarget: "food" }, false, "blog"),
    /라벨·용량·개수·재료 순서/,
  );
  assert.doesNotMatch(
    mediaGuidance({}, true, "blog"),
    new RegExp(BLOG_IMAGE_POLICY_VERSION),
  );
  assert.doesNotMatch(
    mediaGuidance({}, false, "clip"),
    new RegExp(BLOG_IMAGE_POLICY_VERSION),
  );
  assert.match(mediaGuidance({}, true, "clip"), /후편집/);
});
test("poster defaults never invent price or brand and approval prompts bind exact copy", () => {
  const minimal = blogPosterSchema.parse({
    headline: "실제 제목",
    productName: "실제 상품",
  });
  assert.equal(minimal.price, "");
  assert.equal(minimal.brand, "");
  assert.equal(minimal.confirmed, false);
  assert.throws(() => blogPosterSchema.parse({ ...poster, headline: "" }));
  assert.throws(() =>
    blogPosterSchema.parse({ ...poster, price: "가격\n변조" }),
  );
  assert.throws(() =>
    blogPosterSchema.parse({ ...poster, headline: "임의 이모지🎁" }),
  );
  const brief = {
    prompt: "기준 사진의 실제 제품을 보존",
    scenes: [],
    blogPoster: poster,
  };
  assert.notEqual(
    briefingPrompt(brief),
    briefingPrompt({ ...brief, blogPoster: { ...poster, price: "13,000원" } }),
  );
});
test("real Korean poster renderer preserves the full photo, output size and exact inset pixels", async () => {
  const width = 928,
    height = 916,
    left = 48;
  const photo = await sharp({
    create: { width, height, channels: 3, background: "#378568" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="928" height="916"><path d="M0 0h40v40H0zM888 876h40v40h-40z" fill="#d42b31"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const result = await composeBlogPoster(photo, poster);
  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 1536);
  const pixels = await sharp(result).removeAlpha().raw().toBuffer();
  let top = -1;
  for (let y = 0; y < 1536; y++) {
    const offset = (y * 1024 + left) * 3;
    if (
      pixels[offset] === 212 &&
      pixels[offset + 1] === 43 &&
      pixels[offset + 2] === 49
    ) {
      top = y;
      break;
    }
  }
  assert.ok(top >= 0, "The source's upper corner marker must remain visible");
  assert.deepEqual(
    await sharp(result)
      .extract({ left, top, width, height })
      .removeAlpha()
      .raw()
      .toBuffer(),
    await sharp(photo).removeAlpha().raw().toBuffer(),
  );
  const heading = await sharp(result)
    .extract({ left: 48, top: 54, width: 928, height: 280 })
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.ok(
    heading.some((value, i) => value !== [245, 241, 232][i % 3]),
    "Heading should contain actual rendered glyphs",
  );
  await assert.rejects(
    () => composeBlogPoster(photo, { ...poster, confirmed: false }),
    /확인/,
  );
  await assert.rejects(() =>
    composeBlogPoster(Buffer.from("broken image"), poster),
  );
});
test("long Korean copy remains within bounded title and footer regions for both palettes", async () => {
  const photo = await sharp({
    create: { width: 2000, height: 500, channels: 4, background: "#346654" },
  })
    .png()
    .toBuffer();
  for (const palette of ["ivory", "dark"] as const) {
    const result = await composeBlogPoster(photo, {
      ...poster,
      palette,
      headline: "가".repeat(40),
      productName: "나".repeat(60),
      price: "다".repeat(24),
      brand: "라".repeat(40),
    });
    assert.equal((await sharp(result).metadata()).height, 1536);
  }
});
