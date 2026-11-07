import "./helpers";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { create, list, get } from "../src/lib/db";
import { saveAsset, bytes } from "../src/lib/assets";
import {
  mediaBinding,
  editMediaPlan,
  mediaBriefSchema,
} from "../src/lib/media-plans";
import { executeProviderJob, ProviderError } from "../src/lib/providers";
import { briefingPrompt } from "../src/lib/media-guidance";
const network = globalThis.fetch;
after(() => {
  globalThis.fetch = network;
});
const poster = {
  headline: "확인된 상품을 크게",
  productName: "샘플 상품",
  price: "9,800원",
  brand: "샘플 브랜드",
  palette: "ivory" as const,
  confirmed: true,
};
async function fixture(channel = "blog") {
  const p = await create("projects", {
    name: "블로그 포스터 QA",
    status: "producing",
    shootingTarget: "product",
  });
  const t = await create("tasks", {
    projectId: p.id,
    channel,
    brief: "원본 제품 보존",
    briefApprovedAt: "2026-11-08T00:00:00Z",
    status: "planned",
    images: 1,
  });
  const photo = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#376953" },
  })
    .png()
    .toBuffer();
  const source = await saveAsset(
    { projectId: p.id, category: "source", name: "기준.png", buffer: photo },
    "qa",
  );
  const binding = await mediaBinding(p.id, t.id, "image");
  const brief = {
    summary: "제품 보존과 정확한 문구",
    scenes: [
      {
        timing: "1장",
        composition: "전체 제품",
        people: false,
        hands: false,
        eating: false,
        action: "정물",
        camera: "고정",
      },
    ],
    warnings: [],
    prompt: "원본 라벨과 비율 보존. 새 글자는 그리지 마세요.",
    blogPoster: poster,
  };
  const plan = await create("media_plans", {
    projectId: p.id,
    taskId: t.id,
    mediaType: "image",
    ...binding,
    brief,
    status: "draft",
    consumedJobId: null,
  });
  return { p, t, photo, source, plan, brief };
}
test("poster approval requires confirmed text and a blog image; normal photos still approve", async () => {
  const f = await fixture();
  const draft = await editMediaPlan(
    {
      id: f.plan.id,
      version: 1,
      action: "edit",
      brief: { ...f.brief, blogPoster: { ...poster, confirmed: false } },
    },
    "qa",
  );
  await assert.rejects(
    () =>
      editMediaPlan(
        { id: draft.id, version: draft.version, action: "approve" },
        "qa",
      ),
    /원자료/,
  );
  const { blogPoster: _, ...photoBrief } = f.brief;
  const photo = await editMediaPlan(
    { id: draft.id, version: draft.version, action: "edit", brief: photoBrief },
    "qa",
  );
  assert.equal(
    (
      await editMediaPlan(
        { id: photo.id, version: photo.version, action: "approve" },
        "qa",
      )
    ).status,
    "approved",
  );
  const clip = await fixture("clip");
  await assert.rejects(
    () =>
      editMediaPlan({ id: clip.plan.id, version: 1, action: "approve" }, "qa"),
    /블로그 이미지/,
  );
});
test("approved poster is composed in the real provider/storage path exactly once without an extra model call", async () => {
  const f = await fixture();
  const approved = await editMediaPlan(
    { id: f.plan.id, version: 1, action: "approve" },
    "qa",
  );
  assert.equal(
    approved.approvedPrompt,
    briefingPrompt(mediaBriefSchema.parse(f.brief), String(approved.guidance)),
  );
  const job = await create("jobs", {
    projectId: f.p.id,
    taskId: f.t.id,
    type: "image",
    actor: "qa",
    status: "running",
    snapshot: {
      project: f.p,
      task: f.t,
      sourceAssets: [f.source.id],
      mediaPlan: approved,
    },
  });
  process.env.FAL_KEY = "mock-only";
  let submitted = 0;
  let damagedDownload = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://queue.fal.run/") && init?.method === "POST") {
      submitted++;
      const body = JSON.parse(String(init.body));
      assert.equal(body.prompt, approved.approvedPrompt);
      assert.equal(body.num_images, 1);
      return Response.json({
        request_id: "poster-qa",
        status_url: "https://queue.fal.run/qa/status",
        response_url: "https://queue.fal.run/qa/result",
      });
    }
    if (url === "https://queue.fal.run/qa/status")
      return Response.json({ status: "COMPLETED" });
    if (url === "https://queue.fal.run/qa/result")
      return Response.json({
        images: [{ url: "https://v3b.fal.media/qa-poster.png" }],
      });
    if (url === "https://v3b.fal.media/qa-poster.png")
      return new Response(
        new Uint8Array(
          damagedDownload ? Buffer.from("damaged image") : f.photo,
        ),
      );
    return network(input, init);
  };
  try {
    await assert.rejects(
      () => executeProviderJob(job),
      (error: unknown) => error instanceof ProviderError && error.uncertain,
    );
    damagedDownload = false;
    await executeProviderJob((await get(job.id))!);
    await executeProviderJob((await get(job.id))!);
    const assets = (await list("assets")).filter((a) => a.jobId === job.id);
    assert.equal(assets.length, 1);
    assert.equal(submitted, 1);
    const meta = await sharp(await bytes(assets[0])).metadata();
    assert.equal(meta.width, 1024);
    assert.equal(meta.height, 1536);
    assert.match(String(assets[0].editorialNotes), /9,800원/);
    assert.match(
      String(assets[0].editorialNotes),
      /자동으로 검수 완료된 결과가 아닙니다/,
    );
  } finally {
    globalThis.fetch = network;
    delete process.env.FAL_KEY;
  }
});
