import assert from "node:assert/strict";
import sharp from "sharp";
const base = process.env.SMOKE_URL || "http://127.0.0.1:3108";
const email = process.env.SMOKE_ADMIN_EMAIL,
  password = process.env.SMOKE_ADMIN_PASSWORD;
if (!email || !password)
  throw new Error(
    "SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD를 실행 환경에 설정하세요. 테스트 전용 DATA_DIR 서버를 사용하세요.",
  );
let cookie = "";
async function call(path: string, data?: unknown) {
  const r = await fetch(base + path, {
    method: data ? "POST" : "GET",
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!r.ok)
    throw new Error(
      `${path} HTTP ${r.status}: ${typeof body === "object" ? body.error : body}`,
    );
  return body;
}
const denied = await fetch(base + "/api/data");
assert.equal(denied.status, 401);
await call("/api/auth", { email, password });
assert.equal((await call("/api/auth")).email, email);
const csrf = await fetch(base + "/api/data", {
  method: "POST",
  headers: {
    Cookie: cookie,
    Origin: "https://untrusted.invalid",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(csrf.status, 400);
const entity = async (kind: string, data: unknown) =>
  call("/api/data", { kind, data });
const customer = await entity("customers", {
  name: "인수검증 고객",
  brand: "검증 브랜드",
});
const product = await entity("products", {
  name: "인수검증 제품",
  customerId: customer.id,
  facts: "확인된 규격",
});
const price = await entity("prices", {
  name: "인수검증 블로그",
  channel: "blog",
  sale: 30000,
  payout: 5000,
  aiEstimate: 1000,
  images: 1,
  duration: 0,
  mode: "slideshow",
  revisions: 1,
});
const contract = await entity("contracts", {
  name: "인수검증 계약",
  customerId: customer.id,
  lines: [{ priceId: price.id, quantity: 1 }],
  months: 1,
  setsPerMonth: 1,
  startMonth: "2026-10",
});
const project = await entity("projects", {
  name: "인수검증 프로젝트",
  contractId: contract.id,
  productId: product.id,
  slot: 0,
  due: "2026-10-30",
  budget: 10000,
});
const state = await call("/api/data");
assert.ok(
  state.tasks.some((t: { projectId: string }) => t.projectId === project.id),
);
const task = state.tasks.find(
  (t: { projectId: string }) => t.projectId === project.id,
);
const act = async (
  action: string,
  id: string,
  extra: Record<string, unknown> = {},
) => {
  const v = await call("/api/data");
  const item = Object.values(v)
    .flat()
    .find((x: any) => x.id === id) as { version: number };
  return call("/api/data", {
    action,
    data: { id, version: item.version, ...extra },
    key: crypto.randomUUID(),
  });
};
await act("project-notes", project.id, {
  materialNotes: "인수검증 자료",
  instructions: "",
  budget: 10000,
});
await act("project-stage", project.id, { status: "planning" });
await act("task-edit", task.id, {
  brief: "제품 정보 소개",
  assignee: "검증 게시자",
  payout: 5000,
});
await act("project-stage", project.id, { status: "brief_review" });
await act("project-stage", project.id, { status: "producing" });
const image = await sharp({
  create: { width: 256, height: 256, channels: 3, background: "#2563eb" },
})
  .png()
  .toBuffer();
const form = new FormData();
form.set(
  "file",
  new Blob([new Uint8Array(image)], { type: "image/png" }),
  "검증제품.png",
);
form.set("projectId", project.id);
form.set("taskId", task.id);
form.set("category", "image");
const uploaded = await fetch(base + "/api/assets", {
  method: "POST",
  headers: { Cookie: cookie, Origin: base },
  body: form,
});
assert.equal(uploaded.status, 200);
const asset = await uploaded.json();
const file = await fetch(base + "/api/assets/" + asset.id, {
  headers: { Cookie: cookie },
});
assert.equal(file.status, 200);
assert.equal(file.headers.get("content-type"), "image/png");
assert.equal((await fetch(base + "/api/assets/" + asset.id)).status, 404);
await call("/api/assets", {
  projectId: project.id,
  taskId: task.id,
  text: "확인된 제품 소개 원고",
});
await act("approve-task", task.id);
await act("project-stage", project.id, { status: "review" });
await act("project-stage", project.id, { status: "ready" });
const zip = await fetch(base + "/api/deliveries?projectId=" + project.id, {
  headers: { Cookie: cookie },
});
assert.equal(zip.status, 200);
assert.equal(zip.headers.get("content-type"), "application/zip");
assert.equal(
  Buffer.from(await zip.arrayBuffer()).toString("ascii", 0, 2),
  "PK",
);
await call("/api/deliveries", {
  projectId: project.id,
  taskIds: [task.id],
  channel: "인수검증 수동 전달",
});
await act("publication", task.id, {
  link: "https://blog.naver.com/smoke/" + project.id,
  verified: true,
});
await act("project-stage", project.id, { status: "completed" });
await act("settle", project.id);
const options = await call("/api/recommendations", { budget: 150000 });
assert.ok(
  options.length > 0 &&
    options.every((o: { sale: number }) => o.sale <= 150000),
);
const settings = await call("/api/settings");
assert.ok(!JSON.stringify(settings).includes(password));
const logout = await fetch(base + "/api/auth", {
  method: "DELETE",
  headers: { Cookie: cookie, Origin: base },
});
assert.equal(logout.status, 200);
const expired = await fetch(base + "/api/data", {
  headers: { Cookie: cookie },
});
assert.equal(expired.status, 401);
console.log(
  "HTTP smoke passed: auth, CSRF, customer/product/price/contract/project, recommendations, logout.",
);
