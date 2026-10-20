import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { query, execute, transaction, lock, audit } from "./db";
import { tokenHash } from "./auth";
import { isMcpAdmin, mcpRateLimit, type McpIdentity } from "./mcp-oauth";
import {
  callMcpTool,
  prepareMcpProposal,
  assistantProposalSchemas,
} from "./mcp-tools";
import { assistantOutputSchema } from "./assistant-schema";
const opaque = () => randomBytes(32).toString("base64url");
const uuid = z.string().uuid();
type Row = Record<string, any>;
function admin(owner: string) {
  if (!isMcpAdmin(owner)) throw new Error("관리자 권한을 확인해주세요.");
}
const identity = (owner: string): McpIdentity => ({
  email: owner,
  clientId: "dashboard-assistant",
  grantId: "dashboard-assistant",
  scopes: ["catalog:read", "catalog:write", "campaigns:draft"],
});
async function thread(owner: string, id: string) {
  uuid.parse(id);
  const [r] = await query<Row>(
    "select * from assistant_threads where id=$1 and owner=$2",
    [id, owner],
  );
  if (!r) throw new Error("대화를 찾을 수 없어요.");
  return r;
}
export async function assistantStatus(owner: string, threadId?: string) {
  admin(owner);
  const devices = await query<Row>(
    "select id,name,last_seen,status from assistant_devices where owner=$1 and revoked=false order by last_seen desc",
    [owner],
  );
  const threads = await query<Row>(
    "select id,title,created_at from assistant_threads where owner=$1 order by created_at desc limit 30",
    [owner],
  );
  if (threadId) await thread(owner, threadId);
  const turns = threadId
    ? await query<Row>(
        "select id,input,status,created_at,reply,proposal,proposal_status,save_result from assistant_turns where thread_id=$1 and owner=$2 order by created_at,id limit 100",
        [threadId, owner],
      )
    : [];
  return {
    devices: devices.map((d) => ({
      ...d,
      online: Date.now() - Number(d.last_seen) < 45000,
    })),
    threads,
    turns,
  };
}
export async function createAssistantPairing(owner: string) {
  admin(owner);
  await mcpRateLimit("assistant-pair:" + owner, 10, 3600000);
  const code = opaque();
  await execute(
    "insert into assistant_pairings(token_hash,owner,expires) values($1,$2,$3)",
    [tokenHash(code), owner, Date.now() + 600000],
  );
  return { code, expiresIn: 600 };
}
export async function pairAssistantDevice(input: unknown) {
  const b = z
    .object({
      code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      name: z.string().trim().min(1).max(80),
    })
    .strict()
    .parse(input);
  return transaction(async () => {
    const [p] = await query<Row>(
      "select * from assistant_pairings where token_hash=$1 and expires>$2 for update",
      [tokenHash(b.code), Date.now()],
    );
    if (!p)
      throw new Error(
        "연결 코드가 만료됐어요. 대시보드에서 다시 발급해주세요.",
      );
    admin(p.owner);
    const id = randomUUID(),
      token = opaque();
    await execute("delete from assistant_pairings where token_hash=$1", [
      tokenHash(b.code),
    ]);
    await execute(
      "insert into assistant_devices(id,owner,token_hash,name,last_seen) values($1,$2,$3,$4,$5)",
      [id, p.owner, tokenHash(token), b.name, Date.now()],
    );
    await audit(p.owner, "assistant-device-paired", id);
    return { id, token };
  });
}
export async function assistantDevice(token: string) {
  const [d] = await query<Row>(
    "select id,owner,name from assistant_devices where token_hash=$1 and revoked=false",
    [tokenHash(token)],
  );
  if (!d || !isMcpAdmin(d.owner))
    throw new Error("PC 연결이 해제됐어요. 대시보드에서 다시 연결해주세요.");
  return d as { id: string; owner: string; name: string };
}
export async function disconnectAssistant(owner: string, id: string) {
  admin(owner);
  uuid.parse(id);
  await transaction(async () => {
    await execute(
      "update assistant_devices set revoked=true where id=$1 and owner=$2",
      [id, owner],
    );
    await execute(
      "update assistant_turns set status='failed',reply=$3 where device_id=$1 and owner=$2 and status='running'",
      [id, owner, "PC 연결이 해제됐어요. 다시 연결한 뒤 요청해주세요."],
    );
    await audit(owner, "assistant-device-disconnected", id);
  });
}
export async function createAssistantThread(owner: string) {
  admin(owner);
  await mcpRateLimit("assistant-thread:" + owner, 30, 3600000);
  const id = randomUUID();
  await execute(
    "insert into assistant_threads(id,owner,title,created_at) values($1,$2,$3,$4)",
    [id, owner, "새 대화", Date.now()],
  );
  return { id };
}
export async function enqueueAssistant(owner: string, input: unknown) {
  admin(owner);
  const b = z
    .object({
      threadId: uuid,
      requestId: uuid,
      message: z.string().trim().min(1).max(6000),
    })
    .strict()
    .parse(input);
  await mcpRateLimit("assistant-message:" + owner, 30, 3600000);
  return transaction(async () => {
    await lock("assistant-owner:" + owner);
    await lock("assistant-thread:" + b.threadId);
    await thread(owner, b.threadId);
    const [old] = await query<Row>(
      "select id,input,thread_id from assistant_turns where owner=$1 and request_id=$2",
      [owner, b.requestId],
    );
    if (old) {
      if (old.input !== b.message || old.thread_id !== b.threadId)
        throw new Error("같은 요청 번호의 내용이 달라요.");
      return { id: old.id };
    }
    await execute(
      "update assistant_turns set status='failed',reply=$3 where owner=$1 and status='running' and lease_until<$2",
      [owner, Date.now(), "PC 연결이 끊겼어요. 다시 연결한 뒤 요청해주세요."],
    );
    const [active] = await query(
      "select id from assistant_turns where owner=$1 and status in ('queued','running')",
      [owner],
    );
    if (active)
      throw new Error(
        "이전 요청을 처리 중이에요. 완료되거나 중단한 뒤 다시 보내주세요.",
      );
    const [online] = await query(
      "select id from assistant_devices where owner=$1 and revoked=false and status='ready' and last_seen>$2",
      [owner, Date.now() - 45000],
    );
    if (!online)
      throw new Error(
        "연결된 PC가 준비되지 않았어요. PC 연결 프로그램과 ChatGPT 로그인 상태를 확인해주세요.",
      );
    await execute(
      "update assistant_turns set proposal_status='superseded' where thread_id=$1 and proposal_status='pending'",
      [b.threadId],
    );
    const [count] = await query<{ n: number }>(
      "select count(*)::int as n from assistant_turns where thread_id=$1",
      [b.threadId],
    );
    if (count.n >= 100)
      throw new Error("대화가 길어졌어요. 새 대화를 시작해주세요.");
    const id = randomUUID();
    await execute(
      "insert into assistant_turns(id,thread_id,owner,request_id,input,status,created_at) values($1,$2,$3,$4,$5,'queued',$6)",
      [id, b.threadId, owner, b.requestId, b.message, Date.now()],
    );
    await execute(
      "update assistant_threads set title=$2 where id=$1 and title='새 대화'",
      [b.threadId, b.message.slice(0, 45)],
    );
    return { id };
  });
}
export async function cancelAssistant(owner: string, id: string) {
  admin(owner);
  uuid.parse(id);
  await execute(
    "update assistant_turns set status='cancelled',reply=$3 where id=$1 and owner=$2 and status in ('queued','running')",
    [id, owner, "요청을 중단했어요. 저장한 내용은 없어요."],
  );
}
export async function confirmAssistant(owner: string, id: string) {
  admin(owner);
  uuid.parse(id);
  return transaction(async () => {
    const [r] = await query<Row>(
      "select * from assistant_turns where id=$1 and owner=$2 for update",
      [id, owner],
    );
    if (!r) throw new Error("확인 카드를 찾을 수 없어요.");
    if (r.proposal_status === "saved") return r.save_result;
    if (
      r.status !== "completed" ||
      r.proposal_status !== "pending" ||
      !r.proposal
    )
      throw new Error(
        "이 확인 카드는 더 이상 저장할 수 없어요. 새 내용을 확인해주세요.",
      );
    const p = await prepareMcpProposal(r.proposal.tool, r.proposal.args);
    if (!isDeepStrictEqual(p.labels, r.proposal.labels))
      throw new Error(
        "고객·상품·단가 정보가 변경됐어요. 새 확인 카드를 요청해주세요.",
      );
    const result = await callMcpTool(
      p.tool,
      { ...p.args, confirmed: true, requestId: r.id },
      identity(owner),
    );
    if (
      p.tool === "create_campaign_draft" &&
      (result as Row).total !== p.labels.total
    )
      throw new Error("단가가 변경됐어요. 새 확인 카드를 요청해주세요.");
    await execute(
      "update assistant_turns set proposal_status='saved',save_result=$2::jsonb where id=$1",
      [id, JSON.stringify(result)],
    );
    await audit(owner, "assistant-confirmed", id, { tool: p.tool });
    return result;
  });
}
export async function dismissAssistant(owner: string, id: string) {
  admin(owner);
  uuid.parse(id);
  await execute(
    "update assistant_turns set proposal_status='dismissed' where id=$1 and owner=$2 and proposal_status='pending'",
    [id, owner],
  );
}
export async function heartbeatAssistant(
  device: { id: string; owner: string },
  status: string,
  jobId?: string,
  lease?: string,
) {
  if (!["ready", "login_required", "error"].includes(status))
    throw new Error("PC 상태를 확인해주세요.");
  await execute(
    "update assistant_devices set status=$2,last_seen=$3 where id=$1 and revoked=false",
    [device.id, status, Date.now()],
  );
  if (jobId) {
    uuid.parse(jobId);
    const n = await execute(
      "update assistant_turns set lease_until=$4 where id=$1 and device_id=$2 and lease_hash=$3 and status='running'",
      [jobId, device.id, tokenHash(lease || ""), Date.now() + 90000],
    );
    return { continue: n === 1 };
  }
  return { ok: true };
}
export async function claimAssistant(device: { id: string; owner: string }) {
  return transaction(async () => {
    await lock("assistant-owner:" + device.owner);
    await execute(
      "update assistant_turns set status='failed',reply=$3 where owner=$1 and status='running' and lease_until<$2",
      [device.owner, Date.now(), "PC 연결이 끊겼어요. 다시 요청해주세요."],
    );
    await execute(
      "update assistant_turns set status='failed',reply=$3 where owner=$1 and status='queued' and created_at<$2",
      [
        device.owner,
        Date.now() - 300000,
        "PC에서 요청을 받지 못했어요. 연결을 확인한 뒤 다시 요청해주세요.",
      ],
    );
    const [running] = await query(
      "select id from assistant_turns where owner=$1 and status='running'",
      [device.owner],
    );
    if (running) return null;
    const [r] = await query<Row>(
      "select * from assistant_turns where owner=$1 and status='queued' order by created_at limit 1 for update skip locked",
      [device.owner],
    );
    if (!r) return null;
    const lease = opaque();
    await execute(
      "update assistant_turns set status='running',device_id=$2,lease_hash=$3,lease_until=$4 where id=$1",
      [r.id, device.id, tokenHash(lease), Date.now() + 90000],
    );
    const history = await query<Row>(
      "select input,reply,proposal,proposal_status from assistant_turns where thread_id=$1 and owner=$2 and id<>$3 and status='completed' order by created_at desc limit 8",
      [r.thread_id, device.owner, r.id],
    );
    const found = (await callMcpTool(
      "search",
      { limit: 50 },
      identity(device.owner),
    )) as { results: { id: string }[] };
    const catalog = [];
    let contextSize = 0;
    for (const item of found.results) {
      const data = (await callMcpTool(
        "fetch",
        { id: item.id },
        identity(device.owner),
      )) as Row;
      const itemData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [
          k,
          typeof v === "string"
            ? v.slice(0, contextSize > 45000 ? 120 : 1200)
            : v,
        ]),
      );
      contextSize += JSON.stringify(itemData).length;
      catalog.push(itemData);
    }
    const options = await callMcpTool(
      "list_campaign_options",
      {},
      identity(device.owner),
    );
    return {
      id: r.id,
      lease,
      message: r.input,
      history: history.reverse(),
      context: {
        todayKst: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
        catalog,
        catalogLimit: 50,
        options,
        proposalSchemas: assistantProposalSchemas(),
      },
    };
  });
}
export async function completeAssistant(
  device: { id: string; owner: string },
  input: unknown,
) {
  const b = z
    .object({
      id: uuid,
      lease: z.string().max(100),
      output: assistantOutputSchema,
    })
    .strict()
    .parse(input);
  return transaction(async () => {
    const [r] = await query<Row>(
      "select * from assistant_turns where id=$1 and owner=$2 for update",
      [b.id, device.owner],
    );
    if (!r || r.device_id !== device.id || r.lease_hash !== tokenHash(b.lease))
      throw new Error("요청 처리 권한이 없어요.");
    if (r.status === "completed") return { ok: true };
    if (r.status !== "running" || Number(r.lease_until) < Date.now())
      throw new Error("요청이 중단되었거나 만료됐어요.");
    let proposal = null,
      reply = b.output.reply;
    if (b.output.action !== "none") {
      try {
        proposal = await prepareMcpProposal(
          b.output.action,
          JSON.parse(b.output.argumentsJson),
        );
      } catch {
        reply =
          "등록 내용을 확인할 정보가 부족하거나 현재 상품·고객 정보와 맞지 않아요. 고객·제품, 일정·수량·상품을 확인해 다시 요청해주세요. 아직 저장하지 않았어요.";
      }
    }
    await execute(
      "update assistant_turns set status='completed',reply=$2,proposal=$3::jsonb,proposal_status=$4 where id=$1",
      [b.id, reply, JSON.stringify(proposal), proposal ? "pending" : null],
    );
    return { ok: true };
  });
}
export async function failAssistant(
  device: { id: string; owner: string },
  id: string,
  lease: string,
  reason: string,
) {
  uuid.parse(id);
  await execute(
    "update assistant_turns set status='failed',reply=$4 where id=$1 and device_id=$2 and lease_hash=$3 and status='running'",
    [
      id,
      device.id,
      tokenHash(lease),
      reason === "login_required"
        ? "PC에서 ChatGPT 로그인과 구독 한도를 확인해주세요. 저장한 내용은 없어요."
        : "PC에서 답변을 완료하지 못했어요. 연결·구독 한도를 확인하고 다시 요청해주세요. 저장한 내용은 없어요.",
    ],
  );
}
