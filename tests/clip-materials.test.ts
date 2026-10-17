import "./helpers";
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, get, update, list } from "../src/lib/db";
import { command } from "../src/lib/domain";
import { releaseMaterials } from "../src/lib/work-offers";
import { approvedBundle } from "../src/lib/deliveries";
import { portalView } from "../src/lib/portal";
import { saveAsset } from "../src/lib/assets";

test("clip needs video plus exactly one valid description at approval and every delivery path", async () => {
  const p = await create("projects", {
    name: "클립 검증",
    status: "producing",
    due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });
  const participant = await create("participants", {
    name: "설명 QA",
    status: "active",
    phone: "01010000001",
    accounts: [],
  });
  const slot = await create("work_slots", {
    projectId: p.id,
    participantId: participant.id,
    status: "assigned",
    type: "clip",
  });
  const task = await create("tasks", {
    name: "클립 QA",
    projectId: p.id,
    channel: "clip",
    status: "review",
    workSlotId: slot.id,
    participantId: participant.id,
  });
  await update(slot.id, { taskIds: [task.id] });
  const approve = async () =>
    command(
      "approve-task",
      { id: task.id, version: (await get(task.id))!.version },
      "qa",
      crypto.randomUUID(),
    );
  await assert.rejects(approve(), /영상/);
  await create("assets", {
    projectId: p.id,
    taskId: task.id,
    category: "video",
    current: true,
    name: "클립.mp4",
  });
  await assert.rejects(approve(), /설명 원고/);
  await assert.rejects(
    saveAsset(
      {
        projectId: p.id,
        taskId: task.id,
        category: "copy",
        name: "설명.txt",
        text: "짧음",
        buffer: Buffer.from("짧음"),
      },
      "qa",
    ),
    /10~300/,
  );
  const copy = await create("assets", {
    projectId: p.id,
    taskId: task.id,
    category: "copy",
    current: true,
    name: "설명.txt",
    text: "짧음",
  });
  await assert.rejects(approve(), /10~300/);
  const text = "#광고 실제 제품 정보만 소개합니다. #브랜드 #제품";
  await update(copy.id, { text });
  await approve();
  assert.equal((await get(task.id))?.status, "approved");
  await update(copy.id, { text: text + " #태그3 #태그4 #태그5" });
  await assert.rejects(releaseMaterials(slot.id, "qa"), /최대 5개/);
  await assert.rejects(approvedBundle(p.id, [task.id]), /최대 5개/);
  assert.equal((await get(task.id))?.status, "approved");
  await update(copy.id, { text });
  await releaseMaterials(slot.id, "qa");
  assert.equal((await get(task.id))?.status, "delivered");
  const portal = await portalView(participant);
  assert.equal(
    portal.tasks[0].files.find((a) => a.category === "copy")?.text,
    text,
  );
  assert.equal(portal.tasks[0].files.length, 2);
  assert.equal(
    (await list("notification_outbox")).filter((n) => n.type === "materials")
      .length,
    1,
  );
});
