import { intakeQuestions } from "./intake-question-plan";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { get, audit, transaction, lock, query, update } from "./db";
import { intakeFields, type IntakeFields } from "./intake-schema";
import {
  workflowCreate,
  workflowGet,
  workflowList,
  workflowUpdate,
  WorkflowConflict,
  type WorkflowItem,
} from "./workflow-store";
import { WorkflowError } from "./workflow-http";
import { saveAsset, detectMime, extractSheet } from "./assets";
import { signedUpload, objectInfo, getObject, removeObjects } from "./storage";
type IntakeData = {
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  status: "draft" | "submitted" | "changes" | "accepted";
  fields: IntakeFields;
  requested: string[];
  note: string;
  assetIds: string[];
  latestRevision?: string;
};
type RevisionData = {
  fields: IntakeFields;
  assetIds: string[];
  submittedAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
  sourceAssetId?: string;
};
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export async function issueIntake(
  projectId: string,
  requested: string[],
  note: string,
  actor: string,
) {
  return transaction(async () => {
    await lock("project-operations:" + projectId);
    const p = await get(projectId),
      customer = p?.customerId ? await get(String(p.customerId)) : undefined,
      product = p?.productId ? await get(String(p.productId)) : undefined;
    if (
      p?.kind !== "projects" ||
      p.settled ||
      ["completed", "cancelled"].includes(String(p.status))
    )
      throw new WorkflowError("접수 가능한 프로젝트를 선택해주세요.", 409);
    const token = randomBytes(32).toString("hex");
    const fields = intakeFields.parse({
      companyName: String(customer?.brand || customer?.name || ""),
      productName: String(product?.name || ""),
      features: String(product?.facts || ""),
      contactName: String(customer?.contactName || ""),
      contactPhone: String(customer?.phone || ""),
      forbidden: String(product?.forbidden || customer?.forbidden || ""),
    });
    const req = z
      .array(z.enum(["company", "product", "files", "links", "campaign"]))
      .min(1)
      .max(5)
      .parse(requested);
    const row = await workflowCreate<IntakeData>(
      "intake",
      String(p.customerId),
      {
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: "draft",
        fields,
        requested: req,
        note: z.string().trim().max(2000).parse(note),
        assetIds: [],
      },
      p.id,
    );
    await audit(actor, "intake-issued", row.id, {
      projectId: p.id,
      requested: req,
    });
    return {
      id: row.id,
      url: "/intake#" + token,
      expiresAt: row.data.expiresAt,
    };
  });
}
async function access(token: string, expectedId?: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new WorkflowError("유효한 접수 링크로 접속해주세요.", 401);
  const [row] = await query<WorkflowItem<IntakeData>>(
    "select * from workflow_items where kind='intake' and data->>'tokenHash'=$1",
    [hash(token)],
  );
  if (
    !row ||
    row.data.revokedAt ||
    Date.parse(row.data.expiresAt) <= Date.now()
  )
    throw new WorkflowError(
      "접수 링크가 만료되었습니다. 담당자에게 새 링크를 요청해주세요.",
      401,
    );
  if (expectedId && row.id !== expectedId)
    throw new WorkflowError(
      "다른 캠페인 링크가 열렸습니다. 현재 링크로 다시 접속해주세요.",
      409,
    );
  const p = await get(row.project_id!);
  if (
    p?.kind !== "projects" ||
    p.settled ||
    ["completed", "cancelled"].includes(String(p.status))
  )
    throw new WorkflowError("접수가 종료된 프로젝트입니다.", 409);
  return row;
}
function publicView(row: WorkflowItem<IntakeData>) {
  return {
    id: row.id,
    version: row.version,
    status: row.data.status,
    fields: row.data.fields,
    requested: row.data.requested,
    note: row.data.note,
    fileCount: row.data.assetIds.length,
    expiresAt: row.data.expiresAt,
  };
}
export async function intakeView(token: string) {
  const row = await access(token),
    pending = (await workflowList<UploadData>("intake_upload", row.id)).filter(
      (u) =>
        u.data.status === "pending" &&
        Date.parse(u.data.expiresAt) > Date.now(),
    );
  return {
    ...publicView(row),
    pendingUploads: pending.map((u) => ({
      id: u.id,
      name: u.data.name,
      expiresAt: u.data.expiresAt,
    })),
  };
}
export async function saveIntake(
  token: string,
  version: number,
  input: unknown,
  submit: boolean,
  expectedId?: string,
) {
  const incoming = intakeFields.parse(input);
  return transaction(async () => {
    const initial = await access(token, expectedId);
    await lock("intake:" + initial.id);
    const row = await access(token, expectedId);
    if (row.version !== version) throw new WorkflowConflict();
    if (["submitted", "accepted"].includes(row.data.status))
      throw new WorkflowError(
        "제출한 자료를 수정하려면 담당자에게 보완 요청을 문의해주세요.",
        409,
      );
    const allowed = new Set(
      intakeQuestions(row.data.requested).map((q) => q.key),
    );
    const fields = intakeFields.parse({
      ...row.data.fields,
      ...Object.fromEntries(
        Object.entries(incoming).filter(([key]) => allowed.has(key)),
      ),
    });
    if (
      submit &&
      row.data.requested.includes("campaign") &&
      !fields.fulfillment
    )
      throw new WorkflowError("진행 방식을 선택해주세요.");
    if (fields.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(fields.startDate))
      throw new WorkflowError("날짜를 확인해주세요.");
    if (submit && row.data.requested.includes("product") && !fields.productName)
      throw new WorkflowError("제품·서비스명을 입력해주세요.");
    let latestRevision = row.data.latestRevision;
    if (submit) {
      const pending = (
        await workflowList<UploadData>("intake_upload", row.id)
      ).some(
        (u) =>
          u.data.status === "pending" &&
          Date.parse(u.data.expiresAt) > Date.now(),
      );
      if (pending)
        throw new WorkflowError(
          "업로드 중인 자료를 먼저 등록 완료해주세요.",
          409,
        );
      const revision = await workflowCreate<RevisionData>(
        "intake_revision",
        row.id,
        {
          fields,
          assetIds: row.data.assetIds,
          submittedAt: new Date().toISOString(),
        },
        row.project_id!,
      );
      latestRevision = revision.id;
      await audit("intake:" + row.id, "intake-submitted", revision.id, {
        projectId: row.project_id,
      });
    }
    return publicView(
      await workflowUpdate(
        row,
        {
          ...row.data,
          fields,
          status: submit ? "submitted" : "draft",
          latestRevision,
        },
        version,
      ),
    );
  });
}
export async function uploadIntake(
  token: string,
  version: number,
  name: string,
  buffer: Buffer,
  expectedId?: string,
) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (
    ![
      "png",
      "jpg",
      "jpeg",
      "webp",
      "pdf",
      "xlsx",
      "csv",
      "txt",
      "md",
      "mp4",
    ].includes(ext)
  )
    throw new WorkflowError("이미지·PDF·엑셀·텍스트·MP4 파일을 등록해주세요.");
  const max = ext === "mp4" ? 40 * 1024 * 1024 : 4 * 1024 * 1024;
  if (!buffer.length || buffer.length > max)
    throw new WorkflowError(
      ext === "mp4"
        ? "영상은 40MB 이하로 등록해주세요."
        : "자료는 파일당 4MB 이하로 등록해주세요.",
      413,
    );
  detectMime(buffer, ext);
  return transaction(async () => {
    const initial = await access(token, expectedId);
    await lock("intake:" + initial.id);
    const row = await access(token, expectedId);
    if (row.version !== version) throw new WorkflowConflict();
    if (
      !row.data.requested.includes("files") ||
      !["draft", "changes"].includes(row.data.status)
    )
      throw new WorkflowError("현재 자료를 추가할 수 없습니다.", 409);
    if (row.data.assetIds.length >= 30)
      throw new WorkflowError("최대 30개까지 등록할 수 있습니다.");
    const extracted = await extractSheet(buffer, ext);
    const asset = await saveAsset(
      {
        projectId: row.project_id!,
        category: "source",
        name: name.replace(/^.*[\\/]/, ""),
        buffer,
        extracted,
      },
      "intake:" + row.id,
    );
    await workflowUpdate(
      row,
      { ...row.data, assetIds: [...row.data.assetIds, asset.id] },
      version,
    );
    return { id: asset.id, name: asset.name, version: version + 1 };
  });
}
type UploadData = {
  storageName: string;
  name: string;
  size: number;
  expiresAt: string;
  status: "pending" | "completed" | "expired";
  assetId?: string;
};
export async function prepareIntakeUpload(
  token: string,
  name: string,
  size: number,
  expectedId?: string,
) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (
    ![
      "png",
      "jpg",
      "jpeg",
      "webp",
      "pdf",
      "xlsx",
      "csv",
      "txt",
      "md",
      "mp4",
    ].includes(ext)
  )
    throw new WorkflowError("지원하지 않는 자료 형식입니다.");
  const max = ext === "mp4" ? 40 * 1024 * 1024 : 4 * 1024 * 1024;
  if (!Number.isInteger(size) || size <= 0 || size > max)
    throw new WorkflowError(
      ext === "mp4"
        ? "영상은 40MB 이하로 등록해주세요."
        : "자료는 4MB 이하로 등록해주세요.",
      413,
    );
  return transaction(async () => {
    const initial = await access(token, expectedId);
    await lock("intake:" + initial.id);
    const row = await access(token, expectedId);
    if (
      !row.data.requested.includes("files") ||
      !["draft", "changes"].includes(row.data.status)
    )
      throw new WorkflowError("지금은 자료를 추가할 수 없습니다.", 409);
    const uploads = await workflowList<UploadData>("intake_upload", row.id),
      pending = uploads.filter(
        (u) =>
          u.data.status === "pending" &&
          Date.parse(u.data.expiresAt) > Date.now(),
      );
    if (pending.length >= 3 || row.data.assetIds.length + pending.length >= 30)
      throw new WorkflowError("현재 업로드를 마친 뒤 다시 등록해주세요.", 429);
    if (
      uploads
        .filter((u) => Date.parse(String(u.created_at)) > Date.now() - 86400000)
        .reduce((n, u) => n + u.data.size, 0) +
        size >
      250 * 1024 * 1024
    )
      throw new WorkflowError(
        "오늘 등록 가능한 자료 용량을 초과했습니다. 담당자에게 문의해주세요.",
        429,
      );
    const storageName = randomUUID() + "." + ext,
      upload = await workflowCreate<UploadData>(
        "intake_upload",
        row.id,
        {
          storageName,
          name: name.replace(/^.*[\\/]/, ""),
          size,
          expiresAt: new Date(Date.now() + 2 * 3600000).toISOString(),
          status: "pending",
        },
        row.project_id!,
      );
    const signed = await signedUpload(storageName);
    return {
      id: upload.id,
      signedUrl: signed.signedUrl,
      expiresAt: upload.data.expiresAt,
    };
  });
}
export async function completeIntakeUpload(
  token: string,
  id: string,
  expectedId?: string,
) {
  let cleanup: string | undefined;
  const result = await transaction(async () => {
    const initial = await access(token, expectedId);
    await lock("intake:" + initial.id);
    const row = await access(token, expectedId),
      upload = await workflowGet<UploadData>(id, "intake_upload");
    if (!upload || upload.owner_id !== row.id)
      throw new WorkflowError("업로드 요청을 찾을 수 없습니다.", 404);
    if (upload.data.status === "completed")
      return {
        id: upload.data.assetId,
        name: upload.data.name,
        version: row.version,
        fileCount: row.data.assetIds.length,
      };
    if (
      upload.data.status !== "pending" ||
      Date.parse(upload.data.expiresAt) <= Date.now()
    )
      throw new WorkflowError(
        "업로드 요청이 만료되었습니다. 다시 등록해주세요.",
        409,
      );
    if (!["draft", "changes"].includes(row.data.status))
      throw new WorkflowError("제출 전에 등록을 마쳐주세요.", 409);
    const info = await objectInfo(upload.data.storageName);
    if (info.size !== upload.data.size || info.size > 40 * 1024 * 1024) {
      await removeObjects([upload.data.storageName]);
      throw new WorkflowError(
        "업로드한 파일 용량이 등록 정보와 다릅니다.",
        413,
      );
    }
    const buffer = await getObject(upload.data.storageName),
      ext = upload.data.name.split(".").pop()!.toLowerCase();
    detectMime(buffer, ext);
    // Existing upload code performs the same project checks, MIME validation and source storage audit.
    const asset = await uploadIntake(
      token,
      row.version,
      upload.data.name,
      buffer,
    );
    await workflowUpdate(
      upload,
      { ...upload.data, status: "completed", assetId: asset.id },
      upload.version,
    );
    cleanup = upload.data.storageName;
    return { ...asset, fileCount: row.data.assetIds.length + 1 };
  });
  if (cleanup) await removeObjects([cleanup]).catch(() => {});
  return result;
}
export async function cleanupIntakeUploads() {
  const uploads = await workflowList<UploadData>("intake_upload");
  let count = 0;
  for (const row of uploads
    .filter(
      (r) =>
        Date.parse(r.data.expiresAt) < Date.now() &&
        r.data.status !== "expired",
    )
    .slice(0, 50)) {
    await removeObjects([row.data.storageName]);
    await workflowUpdate(row, { ...row.data, status: "expired" }, row.version);
    count++;
  }
  return count;
}
export async function cancelIntakeUpload(
  token: string,
  id: string,
  expectedId?: string,
) {
  return transaction(async () => {
    const initial = await access(token, expectedId);
    await lock("intake:" + initial.id);
    const row = await access(token, expectedId),
      upload = await workflowGet<UploadData>(id, "intake_upload");
    if (!upload || upload.owner_id !== row.id)
      throw new WorkflowError("업로드 요청을 찾을 수 없습니다.", 404);
    if (upload.data.status === "pending") {
      await removeObjects([upload.data.storageName]);
      await workflowUpdate(
        upload,
        { ...upload.data, status: "expired" },
        upload.version,
      );
    }
    return { ok: true };
  });
}
export async function adminIntakes(projectId: string) {
  const rows = await workflowList<IntakeData>("intake", undefined, projectId);
  return rows.map((r) => ({ ...r, data: { ...r.data, tokenHash: undefined } }));
}
export async function reviewIntake(
  id: string,
  version: number,
  action: "accept" | "changes" | "revoke",
  note: string,
  actor: string,
) {
  return transaction(async () => {
    await lock("intake:" + id);
    const row = await workflowGet<IntakeData>(id, "intake");
    if (!row) throw new WorkflowError("접수 요청을 찾을 수 없습니다.", 404);
    if (row.version !== version) throw new WorkflowConflict();
    const comment = z.string().trim().max(2000).parse(note);
    if (
      action !== "revoke" &&
      (row.data.status !== "submitted" ||
        row.data.revokedAt ||
        Date.parse(row.data.expiresAt) <= Date.now())
    )
      throw new WorkflowError("검토할 유효한 제출본이 없습니다.", 409);
    if (action === "changes" && !comment)
      throw new WorkflowError("보완할 내용을 입력해주세요.");
    if (action === "accept") {
      const revision = await workflowGet<RevisionData>(
        row.data.latestRevision!,
        "intake_revision",
      );
      if (!revision || revision.owner_id !== row.id)
        throw new WorkflowError("제출본을 확인해주세요.", 409);
      const source = await saveAsset(
        {
          projectId: row.project_id!,
          category: "source",
          name: "고객 접수 정보.txt",
          buffer: Buffer.from(JSON.stringify(revision.data.fields, null, 2)),
          extracted:
            "고객 제공 정보이며 독립 검증되지 않은 주장입니다.\n" +
            JSON.stringify(revision.data.fields, null, 2),
        },
        actor,
      );
      await workflowUpdate(
        revision,
        {
          ...revision.data,
          acceptedAt: new Date().toISOString(),
          acceptedBy: actor,
          sourceAssetId: source.id,
        },
        revision.version,
      );
      // Preserve the master company/product. Only add a reviewable project source.
      const p = await get(row.project_id!);
      if (p) await update(p.id, { intakeRevisionId: revision.id }, p.version);
    }
    const data = {
      ...row.data,
      note: comment || row.data.note,
      ...(action === "revoke"
        ? { revokedAt: new Date().toISOString() }
        : {
            status:
              action === "accept"
                ? ("accepted" as const)
                : ("changes" as const),
          }),
    };
    await workflowUpdate(row, data, version);
    await audit(actor, "intake-" + action, row.id, {
      revisionId: row.data.latestRevision,
      projectId: row.project_id,
    });
    return { ok: true };
  });
}
