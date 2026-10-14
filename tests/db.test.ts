import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
const { create, get, update, once, transaction, query, list } =
  await import("../src/lib/db");
const { claimJob, enqueue, releaseLease, renewLease } =
  await import("../src/lib/jobs");
const { save, command } = await import("../src/lib/domain");
const actor = "db@local";
test("트랜잭션 롤백: 실패한 트랜잭션의 쓰기는 남지 않는다", async () => {
  const before = (await list("customers")).length;
  await assert.rejects(
    transaction(async () => {
      await create("customers", { name: "rolled back" });
      await create("events", { actor, action: "x", targetId: "y" });
      throw new Error("rollback");
    }),
    /rollback/,
  );
  assert.equal((await list("customers")).length, before);
  // 중첩 트랜잭션(savepoint)은 안쪽만 되돌리고 바깥 작업은 유지한다.
  const kept = await transaction(async () => {
    const outer = await create("customers", { name: "outer" });
    await assert.rejects(
      transaction(async () => {
        await create("customers", { name: "inner" });
        throw new Error("inner");
      }),
    );
    return outer;
  });
  assert.ok(await get(kept.id));
  assert.ok(!(await list("customers")).some((c) => c.name === "inner"));
});
test("낙관적 버전 충돌: 오래된 version으로는 수정할 수 없다", async () => {
  const row = await create("customers", { name: "v1" });
  const next = await update(row.id, { name: "v2" }, row.version);
  assert.equal(next.version, 2);
  await assert.rejects(update(row.id, { name: "v3" }, row.version), /수정/);
  assert.equal((await get(row.id))!.name, "v2");
  await assert.rejects(
    save("customers", { name: "충돌" }, actor, row.id, 1),
    /수정/,
  );
});
test("명령 중복 방지: 같은 key는 한 번만 실행되고 동시 요청도 하나만 수행된다", async () => {
  let runs = 0;
  const key = "once-" + crypto.randomUUID();
  const first = await once(key, async () => {
    runs++;
    return create("customers", { name: "once" });
  });
  const second = await once<typeof first>(key, async () => {
    runs++;
    throw new Error("must not run");
  });
  assert.equal(runs, 1);
  assert.equal(second.id, first.id);
  // 실패한 명령은 결과를 저장하지 않아 다시 시도할 수 있다.
  const failing = "fail-" + crypto.randomUUID();
  await assert.rejects(
    once(failing, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  const retried = await once(failing, async () => "ok");
  assert.equal(retried, "ok");
  // 동시 요청: 두 번째는 advisory lock으로 대기한 뒤 첫 결과를 받는다.
  let concurrent = 0;
  const shared = "shared-" + crypto.randomUUID();
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      once(shared, async () => {
        concurrent++;
        await new Promise((r) => setTimeout(r, 200));
        return create("customers", { name: "concurrent" });
      }),
    ),
  );
  assert.equal(concurrent, 1);
  assert.ok(results.every((r) => r.id === results[0].id));
});
test("worker lease: 작업별 lease로 동시 처리 차단, 만료 후 재개 가능 작업만 이어받음", async () => {
  const c = await save("customers", { name: "lease" }, actor),
    product = await save("products", { name: "제품", customerId: c.id }, actor),
    price = await save(
      "prices",
      {
        name: "블로그",
        channel: "blog",
        sale: 30000,
        payout: 5000,
        aiEstimate: 1000,
        images: 1,
        duration: 0,
        mode: "slideshow",
        revisions: 1,
      },
      actor,
    ),
    contract = await save(
      "contracts",
      {
        name: "계약",
        customerId: c.id,
        lines: [{ priceId: price.id, quantity: 1 }],
        months: 1,
        setsPerMonth: 1,
        startMonth: "2026-10",
      },
      actor,
    ),
    p = await save(
      "projects",
      {
        name: "프로젝트",
        contractId: contract.id,
        slot: 0,
        productId: product.id,
        due: "2026-10-30",
        budget: 10000,
      },
      actor,
    );
  const t = (await list("tasks")).find((t) => t.projectId === p.id)!;
  const act = (action: string, id: string, extra: Record<string, unknown>) =>
    get(id).then((row) =>
      command(
        action,
        { id, version: row!.version, ...extra },
        actor,
        crypto.randomUUID(),
      ),
    );
  await act("project-notes", p.id, {
    materialNotes: "자료",
    instructions: "",
    budget: 10000,
  });
  await act("project-stage", p.id, { status: "planning" });
  await act("task-edit", t.id, { brief: "기획", assignee: "", payout: 5000 });
  await act("project-stage", p.id, { status: "brief_review" });
  await act("project-stage", p.id, { status: "producing" });
  process.env.ANTHROPIC_API_KEY = "test-not-real";
  const job = await enqueue(
    {
      projectId: p.id,
      taskId: t.id,
      type: "copy",
      estimate: 1000,
      key: crypto.randomUUID(),
    },
    actor,
  );
  const claimed = await claimJob("worker-a");
  assert.equal(claimed!.id, job.id);
  assert.equal(claimed!.status, "running");
  // 다른 worker는 lease가 살아 있는 작업을 가져가지 못한다.
  assert.equal(await claimJob("worker-b"), null);
  await renewLease("worker-a", job.id);
  // lease가 만료되고 재개 정보가 없으면 uncertain 처리(공급사 비용 확인 필요).
  await query("update leases set expires=$1 where key=$2", [
    0,
    "job:" + job.id,
  ]);
  assert.equal(await claimJob("worker-b"), null);
  assert.equal((await get(job.id))!.status, "uncertain");
  // 공급사 요청 ID가 저장된 작업은 lease 만료 후 새 요청 없이 이어받는다.
  await update(job.id, {
    status: "running",
    providerState: { provider: "fal", request_id: "req-1" },
  });
  await query("delete from leases where key=$1", ["job:" + job.id]);
  const resumed = await claimJob("worker-c");
  assert.equal(resumed!.id, job.id);
  assert.equal(resumed!.attempts, 2);
  await releaseLease("worker-c", job.id);
  await update(job.id, { status: "failed" });
});
