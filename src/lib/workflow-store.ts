import { randomUUID } from "node:crypto";
import { query } from "./db";

export type WorkflowKind =
  | "payment_request"
  | "intake"
  | "intake_revision"
  | "allocation"
  | "campaign_plan"
  | "preferences"
  | "scene_plan"
  | "assistant_review"
  | "intake_upload";
export type WorkflowItem<T = Record<string, unknown>> = {
  id: string;
  kind: WorkflowKind;
  owner_id: string;
  project_id: string | null;
  data: T;
  version: number;
  created_at: string;
  updated_at: string;
};
export class WorkflowConflict extends Error {
  constructor() {
    super("다른 곳에서 변경되었습니다. 새로고침 후 다시 시도해주세요.");
  }
}
export async function workflowGet<T = Record<string, unknown>>(
  id: string,
  kind: WorkflowKind,
) {
  return (
    await query<WorkflowItem<T>>(
      "select * from workflow_items where id=$1 and kind=$2",
      [id, kind],
    )
  )[0];
}
export async function workflowList<T = Record<string, unknown>>(
  kind: WorkflowKind,
  owner?: string,
  project?: string,
) {
  return query<WorkflowItem<T>>(
    "select * from workflow_items where kind=$1 and ($2::text is null or owner_id=$2) and ($3::uuid is null or project_id=$3) order by created_at desc,id",
    [kind, owner ?? null, project ?? null],
  );
}
export async function workflowCreate<T extends object>(
  kind: WorkflowKind,
  owner: string,
  data: T,
  project?: string,
) {
  return (
    await query<WorkflowItem<T>>(
      "insert into workflow_items(id,kind,owner_id,project_id,data) values($1,$2,$3,$4,$5::jsonb) returning *",
      [randomUUID(), kind, owner, project ?? null, JSON.stringify(data)],
    )
  )[0];
}
export async function workflowUpdate<T extends object>(
  item: WorkflowItem<unknown>,
  data: T,
  version: number,
) {
  const row = (
    await query<WorkflowItem<T>>(
      "update workflow_items set data=$1::jsonb, version=version+1, updated_at=now() where id=$2 and kind=$3 and version=$4 returning *",
      [JSON.stringify(data), item.id, item.kind, version],
    )
  )[0];
  if (!row) throw new WorkflowConflict();
  return row;
}
