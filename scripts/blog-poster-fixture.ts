import { config } from "dotenv";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { composeBlogPoster } from "../src/lib/blog-poster";
config({ path: ".env.local", quiet: true });
const session = JSON.parse(
  await readFile("output/service-qa/session.json", "utf8"),
);
if (!/^lifecycle_[a-f0-9]{12}$/.test(session.schema))
  throw new Error("QA schema required");
process.env.DB_SCHEMA = session.schema;
process.env.SUPABASE_STORAGE_PREFIX = session.schema + "/";
const { create, closeDb } = await import("../src/lib/db");
const { saveAsset } = await import("../src/lib/assets");
const { mediaBinding } = await import("../src/lib/media-plans");
await mkdir("output/blog-poster", { recursive: true });
// A code-drawn fictitious product checks composition; no customer photo or paid generation.
const source = await sharp(
  Buffer.from(
    '<svg width="928" height="916" xmlns="http://www.w3.org/2000/svg"><rect width="928" height="916" fill="#ece5d9"/><ellipse cx="464" cy="766" rx="190" ry="30" fill="#cec4b2"/><rect x="319" y="300" width="290" height="450" rx="48" fill="#58755f"/><rect x="346" y="255" width="236" height="60" rx="12" fill="#263d31"/><rect x="354" y="440" width="220" height="160" rx="4" fill="#faf7ed"/><path d="M410 480h108M410 520h108M430 560h68" stroke="#78917c" stroke-width="8"/></svg>',
  ),
)
  .png()
  .toBuffer();
const design = {
  headline: "사진과 글자, 각자의 자리",
  productName: "가상 제품 · 배치 검증용",
  price: "샘플 가격 12,000원",
  brand: "원마케팅 QA · 실제 판매 상품 아님",
  palette: "ivory" as const,
  confirmed: true,
};
await writeFile("output/blog-poster/source.png", source);
for (const palette of ["ivory", "dark"] as const)
  await writeFile(
    `output/blog-poster/poster-${palette}.png`,
    await composeBlogPoster(source, { ...design, palette }),
  );
if (process.argv.includes("--preview-only")) {
  await closeDb();
  console.log("Poster render previews refreshed without database changes.");
  process.exit(0);
}
const customer = await create("customers", { name: "격리 QA", brand: "샘플" });
const product = await create("products", {
  name: "가상 배치 검증 제품",
  customerId: customer.id,
});
const project = await create("projects", {
  name: "블로그 홍보 이미지 QA",
  customerId: customer.id,
  productId: product.id,
  due: "2027-01-31",
  status: "producing",
  shootingTarget: "product",
  budget: 0,
});
const task = await create("tasks", {
  name: "샘플 블로그",
  projectId: project.id,
  channel: "blog",
  brief: "가상 제품 배치 검증",
  briefApprovedAt: "2026-11-08T00:00:00Z",
  status: "planned",
  images: 1,
});
await saveAsset(
  {
    projectId: project.id,
    category: "source",
    name: "가상제품-배치검증.png",
    buffer: source,
  },
  "qa",
);
const binding = await mediaBinding(project.id, task.id, "image");
const plan = await create("media_plans", {
  projectId: project.id,
  taskId: task.id,
  mediaType: "image",
  ...binding,
  brief: {
    summary: "상품 보존과 정확한 문구 합성",
    scenes: [
      {
        timing: "1장",
        composition: "전체 제품을 보존",
        people: false,
        hands: false,
        eating: false,
        action: "정물",
        camera: "고정",
      },
    ],
    warnings: [],
    prompt: "기준 사진만 활용하고 새 글자를 생성하지 마세요.",
  },
  status: "draft",
  consumedJobId: null,
});
await writeFile(
  "output/blog-poster/fixture.json",
  JSON.stringify({ projectId: project.id, taskId: task.id, planId: plan.id }),
);
await closeDb();
console.log("Isolated blog poster fixtures and two render previews created.");
