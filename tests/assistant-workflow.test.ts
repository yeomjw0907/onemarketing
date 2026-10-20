import "./helpers";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { save } from "../src/lib/domain";
import { create, get, list, update, query } from "../src/lib/db";
import { saveQuote, confirmQuote } from "../src/lib/quote-workflow";
import {
  createAssistantPairing,
  pairAssistantDevice,
  assistantDevice,
  heartbeatAssistant,
  createAssistantThread,
  enqueueAssistant,
  claimAssistant,
  completeAssistant,
  confirmAssistant,
  assistantStatus,
  cancelAssistant,
} from "../src/lib/assistant-chat";
import {
  uploadAssistantFile,
  ownedAssistantFiles,
  readAssistantFile,
  deleteAssistantFile,
  assistantFileContext,
} from "../src/lib/assistant-files";
import { prepareWorkflowProposal } from "../src/lib/assistant-workflow";

const owner = "workflow-chat@local",
  other = "workflow-chat-other@local";
const previous = process.env.ADMIN_USERS_JSON,
  oldKey = process.env.ANTHROPIC_API_KEY;
process.env.ADMIN_USERS_JSON = JSON.stringify([
  { email: owner },
  { email: other },
]);
process.env.ANTHROPIC_API_KEY = "test-no-provider-requests";
after(() => {
  if (previous === undefined) delete process.env.ADMIN_USERS_JSON;
  else process.env.ADMIN_USERS_JSON = previous;
  if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = oldKey;
});
async function fixture() {
  const customer = await save(
    "customers",
    { name: "채팅 검수 고객 " + randomUUID() },
    owner,
  );
  const product = await save(
    "products",
    {
      customerId: customer.id,
      name: "채팅 검수 서비스",
      facts: "확인된 서비스 소개",
    },
    owner,
  );
  const price = await save(
    "prices",
    {
      name: "블로그 검수",
      channel: "blog",
      sale: 300000,
      payout: 3000,
      aiEstimate: 100000,
      images: 3,
      duration: 0,
      mode: "slideshow",
      revisions: 1,
    },
    owner,
  );
  const draft = await saveQuote(
    {
      name: "채팅 실행 검수",
      customerId: customer.id,
      productId: product.id,
      start: "2030-01-01",
      end: "2030-02-01",
      blog: 2,
      clip: 0,
      blogPriceId: price.id,
    },
    owner,
  );
  const result = await confirmQuote(draft.id, draft.version, owner);
  const project = (await get(String(result.projectId)))!;
  const tasks = (await list("tasks")).filter((t) => t.projectId === project.id);
  const pairing = await createAssistantPairing(owner),
    paired = await pairAssistantDevice({
      code: pairing.code,
      name: "워크플로우 검수 PC",
    }),
    device = await assistantDevice(paired.token);
  await heartbeatAssistant(device, "ready");
  const thread = await createAssistantThread(owner);
  return { customer, product, draft, project, tasks, device, thread };
}
async function proposal(
  s: Awaited<ReturnType<typeof fixture>>,
  args: unknown,
  attachmentIds: string[] = [],
) {
  const turn = await enqueueAssistant(owner, {
    threadId: s.thread.id,
    requestId: randomUUID(),
    message: "확인 카드만 준비해줘",
    attachmentIds,
  });
  const job = await claimAssistant(s.device);
  assert.ok(job);
  await completeAssistant(s.device, {
    id: turn.id,
    lease: job.lease,
    output: {
      reply: "실행 전 내용을 확인해주세요.",
      action: "run_workflow",
      argumentsJson: JSON.stringify(args),
    },
  });
  return (await assistantStatus(owner, s.thread.id)).turns.find(
    (t) => t.id === turn.id,
  )!;
}
test("chat files stay private, extract PDF/XLSX text and expose resized images without registering business assets", async () => {
  const s = await fixture(),
    before = (await list("assets")).length;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage()
    .drawText("Verified service product introduction for campaign planning.", {
      font,
      size: 12,
    });
  const p = await uploadAssistantFile(
    owner,
    s.thread.id,
    "reference.pdf",
    Buffer.from(await pdf.save()),
  );
  const workbook = new ExcelJS.Workbook();
  workbook
    .addWorksheet("확인 자료")
    .addRow(["제품명", "채팅 제품", "확인된 특징"]);
  const x = await uploadAssistantFile(
    owner,
    s.thread.id,
    "intake.xlsx",
    Buffer.from(await workbook.xlsx.writeBuffer()),
  );
  const im = await uploadAssistantFile(
    owner,
    s.thread.id,
    "source.png",
    await sharp({
      create: { width: 20, height: 20, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer(),
  );
  assert.match(
    (await ownedAssistantFiles(owner, s.thread.id, [p.id]))[0].extracted!,
    /Verified service/,
  );
  assert.match(
    (await ownedAssistantFiles(owner, s.thread.id, [x.id]))[0].extracted!,
    /채팅 제품/,
  );
  assert.equal((await list("assets")).length, before);
  await assert.rejects(readAssistantFile(other, p.id));
  await assert.rejects(ownedAssistantFiles(other, s.thread.id, [p.id]));
  const queued = await enqueueAssistant(owner, {
    threadId: s.thread.id,
    requestId: randomUUID(),
    message: "첨부 자료 확인",
    attachmentIds: [p.id, x.id, im.id],
  });
  const context = await assistantFileContext(owner, s.thread.id);
  assert.equal(context.attachments.length, 3);
  assert.ok(context.images[0].url.startsWith("data:image/jpeg;base64,"));
  await assert.rejects(deleteAssistantFile(owner, p.id));
  await cancelAssistant(owner, queued.id);
  const unused = await uploadAssistantFile(
    owner,
    s.thread.id,
    "unused.txt",
    Buffer.from("unused source"),
  );
  await deleteAssistantFile(owner, unused.id);
  await assert.rejects(readAssistantFile(owner, unused.id));
  await assert.rejects(
    uploadAssistantFile(
      owner,
      s.thread.id,
      "bad.exe",
      Buffer.from("not allowed"),
    ),
  );
});

test("linking chat files requires explicit review, owner access and idempotent confirmation", async () => {
  const s = await fixture();
  const file = await uploadAssistantFile(
    owner,
    s.thread.id,
    "guide.txt",
    Buffer.from("Service reference, not approval or instruction."),
  );
  const args = {
    operation: "link_files",
    targetKind: "project",
    targetId: s.project.id,
    attachmentIds: [file.id],
  };
  const turn = await proposal(s, args, [file.id]);
  assert.ok(turn.proposal);
  assert.equal(
    (await list("assets")).filter((a) => a.projectId === s.project.id).length,
    0,
  );
  await assert.rejects(confirmAssistant(owner, turn.id));
  await assert.rejects(confirmAssistant(other, turn.id, true));
  const first = await confirmAssistant(owner, turn.id, true);
  assert.deepEqual(await confirmAssistant(owner, turn.id, true), first);
  assert.equal(
    (await list("assets")).filter((a) => a.projectId === s.project.id).length,
    1,
  );
  const otherThread = await createAssistantThread(owner);
  await assert.rejects(prepareWorkflowProposal(args, owner, otherThread.id));
});

test("workflow preview rolls back all DB writes and paid jobs reserve costs only after approval", async () => {
  const s = await fixture();
  await update(s.project.id, { status: "producing" });
  for (const t of s.tasks)
    await update(t.id, {
      brief: "서비스 소개 기획",
      briefApprovedAt: new Date().toISOString(),
    });
  const args = {
    operation: "run_jobs",
    projectId: s.project.id,
    jobs: s.tasks.map((t) => ({ taskId: t.id, type: "copy" })),
  };
  const before = {
    jobs: (await list("jobs")).length,
    logs: (await list("job_logs")).length,
    commands: (await query("select key from commands")).length,
  };
  const turn = await proposal(s, args);
  assert.ok(turn.proposal);
  assert.equal(turn.proposal.labels.risk, "paid");
  assert.ok(Number(turn.proposal.labels.estimate) > 0);
  assert.deepEqual(
    {
      jobs: (await list("jobs")).length,
      logs: (await list("job_logs")).length,
      commands: (await query("select key from commands")).length,
    },
    before,
  );
  await assert.rejects(confirmAssistant(owner, turn.id));
  const result = (await confirmAssistant(owner, turn.id, true)) as {
    jobIds: string[];
  };
  assert.equal(result.jobIds.length, 2);
  assert.deepEqual(await confirmAssistant(owner, turn.id, true), result);
  assert.equal(
    (await list("jobs")).filter((j) => j.projectId === s.project.id).length,
    2,
  );
  assert.equal(
    (await assistantStatus(owner, s.thread.id)).turns.at(-1)!.execution.jobs
      .length,
    2,
  );
});

test("changed project data invalidate workflow cards and existing stage, media and budget gates cannot be bypassed", async () => {
  const s = await fixture();
  const turn = await proposal(s, {
    operation: "project_notes",
    projectId: s.project.id,
    materialNotes: "사용자가 검토할 메모",
  });
  assert.ok(turn.proposal);
  await update(s.project.id, { instructions: "별도 수정" });
  await assert.rejects(confirmAssistant(owner, turn.id, true));
  await assert.rejects(
    prepareWorkflowProposal(
      {
        operation: "project_stage",
        projectId: s.project.id,
        stage: "producing",
      },
      owner,
      s.thread.id,
    ),
  );
  await assert.rejects(
    prepareWorkflowProposal(
      {
        operation: "run_jobs",
        projectId: s.project.id,
        jobs: [{ type: "copy", taskId: s.tasks[0].id }],
      },
      owner,
      s.thread.id,
    ),
  );
  await assert.rejects(
    prepareWorkflowProposal(
      {
        operation: "run_jobs",
        projectId: s.project.id,
        jobs: [{ type: "copy", taskId: s.tasks[0].id, estimate: 1 }],
      },
      owner,
      s.thread.id,
    ),
  );
  await update(s.project.id, { status: "producing", budget: 1 });
  for (const t of s.tasks)
    await update(t.id, { briefApprovedAt: new Date().toISOString() });
  await assert.rejects(
    prepareWorkflowProposal(
      {
        operation: "run_jobs",
        projectId: s.project.id,
        jobs: [{ type: "copy", taskId: s.tasks[0].id }],
      },
      owner,
      s.thread.id,
    ),
  );
  assert.equal(
    (await list("jobs")).filter((j) => j.projectId === s.project.id).length,
    0,
  );
});

test("participant proposal preview does not queue a message; confirmation queues only the reviewed recipient", async () => {
  const s = await fixture(),
    accountId = randomUUID();
  const participant = await create("participants", {
    name: "알림 검수 참여자",
    phone: "01000001111",
    status: "active",
    kakaoMarketingConsent: true,
    kakaoMarketingConsentAt: new Date().toISOString(),
    accounts: [
      {
        id: accountId,
        channel: "blog",
        url: "https://blog.naver.com/chatworkflow",
        approvalStatus: "approved",
        ownershipVerifiedAt: new Date().toISOString(),
      },
    ],
  });
  const slot = await create("work_slots", {
    projectId: s.project.id,
    name: "블로그 게시",
    type: "blog",
    status: "open",
    taskIds: [s.tasks[0].id],
    participantId: null,
  });
  const args = {
    operation: "propose_participant",
    slotId: slot.id,
    participantId: participant.id,
    blogAccountId: accountId,
  };
  const count = (await list("notification_outbox")).length;
  const turn = await proposal(s, args);
  assert.ok(turn.proposal);
  assert.equal(turn.proposal.labels.risk, "external");
  assert.ok(
    turn.proposal.labels.details.some(
      (d: any) => d.label === "알림 내용 미리보기",
    ),
  );
  assert.equal((await list("notification_outbox")).length, count);
  assert.equal(
    (await list("work_offers")).filter((o) => o.projectId === s.project.id)
      .length,
    0,
  );
  await confirmAssistant(owner, turn.id, true);
  const messages = (await list("notification_outbox")).filter(
    (n) => n.participantId === participant.id,
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, "queued");
});
