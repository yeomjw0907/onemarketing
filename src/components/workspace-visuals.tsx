"use client";
import {
  Building2,
  Package,
  FileText,
  Layers3,
  Users,
  ArrowUpRight,
  ChevronRight,
  Trash2,
  Pencil,
  FolderOpen,
  Check,
  Clock3,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  money,
  stageLabels,
  type DatabaseView,
  type RecordData,
} from "@/lib/types";
import { workspaceSnapshot, recordProgress } from "@/lib/workspace-visuals";
import { Button } from "./ui/workflow-ui";
import styles from "./workspace-visuals.module.css";
export { styles as workspaceVisualStyles };
type Metric = { label: string; value: ReactNode; note?: string };
export function SignalRail({ items }: { items: Metric[] }) {
  return (
    <div className={styles.signals}>
      {items.map((m) => (
        <div key={m.label}>
          <span>{m.label}</span>
          <strong>{m.value}</strong>
          {m.note && <small>{m.note}</small>}
        </div>
      ))}
    </div>
  );
}
export function QuantityBar({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  return (
    <div className={styles.quantity}>
      <div>
        <span>{label}</span>
        <strong>
          {done}
          <small> / {total}</small>
        </strong>
      </div>
      <div
        className={styles.track}
        role="img"
        aria-label={`${label} ${total}건 중 ${done}건`}
      >
        <span
          style={{
            width: total ? `${Math.min(100, (done / total) * 100)}%` : "0%",
          }}
        />
      </div>
    </div>
  );
}
export function StatusDistribution({
  items,
  label,
}: {
  items: { label: string; value: number }[];
  label: string;
}) {
  const total = items.reduce((n, x) => n + x.value, 0);
  return (
    <div className={styles.distribution}>
      <div
        className={styles.distributionTrack}
        role="img"
        aria-label={items.map((i) => `${i.label} ${i.value}건`).join(", ")}
      >
        {items.map(
          (i, n) =>
            i.value > 0 && (
              <span
                key={i.label}
                style={{
                  flex: i.value,
                  background: ["#3182f6", "#75aaff", "#b4d2fc", "#dce6f2"][
                    n % 4
                  ],
                }}
              />
            ),
        )}
      </div>
      <div className={styles.legend}>
        <strong>{label}</strong>
        {items.map((i, n) => (
          <span key={i.label}>
            <i
              style={{
                background: ["#3182f6", "#75aaff", "#b4d2fc", "#dce6f2"][n % 4],
              }}
            />
            {i.label}
            <b>{i.value}</b>
          </span>
        ))}
        {!total && <span>집계할 항목이 없어요</span>}
      </div>
    </div>
  );
}
export function WorkspaceOverview({
  data,
  page,
}: {
  data: DatabaseView;
  page: string;
}) {
  const s = workspaceSnapshot(data);
  let items: Metric[] = [];
  let distribution: { label: string; value: number }[] = [];
  switch (page) {
    case "customers":
      items = [
        {
          label: "등록 고객",
          value: s.customers.length,
          note: "삭제된 고객 제외",
        },
        {
          label: "등록 제품",
          value: s.products.length,
          note: "등록 고객의 제품",
        },
        {
          label: "진행 캠페인",
          value: s.activeProjects,
          note: "보류·완료·취소 제외",
        },
      ];
      break;
    case "projects":
      items = [
        { label: "진행 중", value: s.activeProjects },
        { label: "게시 확인", value: `${s.verified}건` },
        {
          label: "보류",
          value: s.projects.filter((p) => p.hold && p.status !== "completed")
            .length,
        },
        {
          label: "운영 완료",
          value: s.projects.filter((p) => p.status === "completed").length,
        },
      ];
      break;
    case "contracts":
      items = [
        {
          label: "확정 계약",
          value: data.contracts.filter((c) => c.status === "confirmed").length,
        },
        {
          label: "견적 초안",
          value: data.quote_drafts.filter(
            (q) => q.status !== "confirmed" && q.status !== "cancelled",
          ).length,
        },
        { label: "진행 캠페인", value: s.activeProjects },
      ];
      break;
    case "reviews":
      items = [
        { label: "결과물 검수", value: `${s.review}건` },
        { label: "수정 요청", value: `${s.changes}건` },
        {
          label: "게시 유지 이상",
          value: `${s.recovery}건`,
          note: "캠페인 운영에서 확인",
        },
      ];
      distribution = [
        {
          label: "블로그",
          value: s.tasks.filter(
            (t) =>
              t.channel === "blog" &&
              ["review", "changes"].includes(String(t.status)),
          ).length,
        },
        {
          label: "클립",
          value: s.tasks.filter(
            (t) =>
              t.channel === "clip" &&
              ["review", "changes"].includes(String(t.status)),
          ).length,
        },
      ];
      break;
    case "publishing":
      items = [
        { label: "링크 접수", value: `${s.submitted}건` },
        { label: "3일 경과·검수 가능", value: `${s.reviewReady}건` },
        { label: "게시 확인 완료", value: `${s.verified}건` },
      ];
      distribution = [
        {
          label: "전달 준비",
          value: s.tasks.filter((t) => t.status === "approved").length,
        },
        {
          label: "게시 대기",
          value: s.tasks.filter((t) => t.status === "delivered").length,
        },
        { label: "링크 접수", value: s.submitted },
        { label: "게시 확인", value: s.verified },
      ];
      break;
    case "library":
      items = [
        {
          label: "보관 자료",
          value: `${s.sources.length}개`,
          note: "고객 공통 자료",
        },
        {
          label: "자료 등록 고객",
          value: s.customers.filter((c) =>
            s.sources.some((a) => a.customerId === c.id),
          ).length,
        },
        { label: "등록 고객", value: s.customers.length },
      ];
      break;
    case "participants":
      items = [
        { label: "등록 참여자", value: s.people.length },
        { label: "활동 중", value: s.activePeople },
        {
          label: "보유 계정",
          value: s.people.reduce(
            (n, p) => n + (Array.isArray(p.accounts) ? p.accounts.length : 0),
            0,
          ),
        },
        {
          label: "진행 중인 작업",
          value: s.tasks.filter(
            (t) => t.participantId && !["verified"].includes(String(t.status)),
          ).length,
        },
      ];
      distribution = [
        { label: "활동 중", value: s.activePeople },
        {
          label: "섭외 보류",
          value: s.people.filter((p) => p.status === "paused").length,
        },
        {
          label: "협업 종료",
          value: s.people.filter((p) => p.status === "closed").length,
        },
      ];
      break;
    case "settings":
      items = [
        { label: "등록 상품·단가", value: data.prices.length },
        {
          label: "블로그 상품",
          value: data.prices.filter((p) => p.channel === "blog").length,
        },
        {
          label: "클립 상품",
          value: data.prices.filter((p) => p.channel === "clip").length,
        },
      ];
      break;
  }
  return items.length ? (
    <div className={styles.overview}>
      <SignalRail items={items} />
      {distribution.length > 0 && (
        <StatusDistribution
          items={distribution}
          label={
            page === "participants" ? "참여자 활동 현황" : "현재 작업 분포"
          }
        />
      )}
    </div>
  ) : null;
}
function EmptyList() {
  return (
    <div className={styles.empty}>
      <FolderOpen size={25} />
      <strong>표시할 항목이 없어요</strong>
      <span>검색 조건을 바꾸거나 새로 등록해주세요.</span>
    </div>
  );
}
export function CustomerDirectory({
  rows,
  data,
  onOpen,
  onDelete,
  busy,
}: {
  rows: RecordData[];
  data: DatabaseView;
  onOpen: (r: RecordData) => void;
  onDelete: (r: RecordData) => void;
  busy: boolean;
}) {
  return (
    <div className={styles.directory}>
      {rows.map((c) => {
        const products = data.products.filter(
            (p) => p.customerId === c.id && !p.deletedAt,
          ).length,
          projects = data.projects.filter(
            (p) =>
              p.customerId === c.id &&
              !p.hold &&
              !["cancelled", "completed"].includes(String(p.status)),
          ).length;
        return (
          <article key={c.id} className={styles.record}>
            <button className={styles.recordMain} onClick={() => onOpen(c)}>
              <span className={styles.mark}>
                <Building2 size={21} />
              </span>
              <span>
                <strong>{String(c.name)}</strong>
                <small>{String(c.brand || "브랜드 미등록")}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
            <div className={styles.recordFacts}>
              <span>
                제품 <b>{products}개</b>
              </span>
              <span>
                진행 캠페인 <b>{projects}개</b>
              </span>
            </div>
            <p>{String(c.contact || "연락처 미등록")}</p>
            <div className={styles.recordActions}>
              <Button variant="text" onClick={() => onOpen(c)}>
                상세 보기
                <ChevronRight size={14} />
              </Button>
              <button
                className={styles.quietDelete}
                disabled={busy}
                onClick={() => onDelete(c)}
                aria-label={`${String(c.name)} 고객 삭제`}
              >
                <Trash2 size={14} />
                고객 삭제
              </button>
            </div>
          </article>
        );
      })}
      {!rows.length && <EmptyList />}
    </div>
  );
}
export function ProductDirectory({
  rows,
  onEdit,
  onDelete,
  busy,
}: {
  rows: RecordData[];
  onEdit: (r: RecordData) => void;
  onDelete: (r: RecordData) => void;
  busy: boolean;
}) {
  return (
    <div className={styles.directory}>
      {rows.map((p) => (
        <article key={p.id} className={styles.record}>
          <span className={styles.mark}>
            <Package size={21} />
          </span>
          <h3>{String(p.name)}</h3>
          <p className={styles.productFacts}>
            {String(p.facts || "제품 정보가 아직 없어요.").slice(0, 160)}
          </p>
          <div className={styles.recordActions}>
            <Button onClick={() => onEdit(p)}>
              <Pencil size={14} />
              자료·규칙 수정
            </Button>
            <button
              className={styles.quietDelete}
              disabled={busy}
              onClick={() => onDelete(p)}
              aria-label={`${String(p.name)} 제품 삭제`}
            >
              <Trash2 size={14} />
              제품 삭제
            </button>
          </div>
        </article>
      ))}
      {!rows.length && <EmptyList />}
    </div>
  );
}
export function ProjectDirectory({
  rows,
  data,
  onOpen,
}: {
  rows: RecordData[];
  data: DatabaseView;
  onOpen: (r: RecordData) => void;
}) {
  return (
    <div className={styles.projectList}>
      {rows.map((p) => {
        const progress = recordProgress(
          data.tasks.filter((t) => t.projectId === p.id),
        );
        const customer = data.customers.find((c) => c.id === p.customerId);
        return (
          <button
            className={styles.projectRow}
            key={p.id}
            onClick={() => onOpen(p)}
          >
            <span className={styles.mark}>
              <Layers3 size={20} />
            </span>
            <span className={styles.projectName}>
              <strong>{String(p.name)}</strong>
              <small>
                {String(customer?.name || "고객 미지정")} ·{" "}
                {p.due ? String(p.due) + " 마감" : "마감 미정"}
              </small>
            </span>
            <span className={styles.status}>
              {p.hold
                ? "보류"
                : stageLabels[String(p.status)] || String(p.status)}
            </span>
            <QuantityBar {...progress} label="게시 확인" />
            <ChevronRight size={17} />
          </button>
        );
      })}
      {!rows.length && <EmptyList />}
    </div>
  );
}
export function ContractDirectory({
  data,
  onStart,
}: {
  data: DatabaseView;
  onStart: (r: RecordData) => void;
}) {
  return (
    <div className={styles.directory}>
      {data.contracts.map((c) => {
        const started = data.projects.filter(
          (p) => p.contractId === c.id,
        ).length;
        const total = Number(c.slotCount);
        return (
          <article key={c.id} className={styles.record}>
            <div className={styles.contractName}>
              <span className={styles.mark}>
                <FileText size={20} />
              </span>
              <span>
                <strong>{String(c.name)}</strong>
                <small>
                  {String(
                    data.customers.find((x) => x.id === c.customerId)?.name ||
                      "고객 미지정",
                  )}
                </small>
              </span>
            </div>
            <div className={styles.contractPrice}>
              <strong>{money(c.sale)}</strong>
              <small>회차당 공급가액 · VAT {money(c.vat)}</small>
            </div>
            <QuantityBar
              done={started}
              total={Number.isFinite(total) ? total : 0}
              label="프로젝트 시작"
            />
            <p>
              {String(c.months)}개월 × 월 {String(c.setsPerMonth)}회
            </p>
            {Array.isArray(c.packageSnapshots) && (
              <details className={styles.packageDetails}>
                <summary>제공 구성 보기</summary>
                {(c.packageSnapshots as Record<string, unknown>[]).map(
                  (p, i) => (
                    <p key={i}>
                      {String(p.label)} × {String(p.quantity)}
                    </p>
                  ),
                )}
              </details>
            )}
            <Button variant="primary" onClick={() => onStart(c)}>
              프로젝트 시작
              <ArrowUpRight size={15} />
            </Button>
          </article>
        );
      })}
      {!data.contracts.length && <EmptyList />}
    </div>
  );
}
export function WorkflowOverview({
  data,
  projectId,
  onTab,
}: {
  data: DatabaseView;
  projectId: string;
  onTab: (v: string) => void;
}) {
  const tasks = workspaceSnapshot(data).tasks.filter(
    (t) => !projectId || t.projectId === projectId,
  );
  const slots = workspaceSnapshot(data).assignableSlots.filter(
    (s) => !projectId || s.projectId === projectId,
  );
  const steps = [
    {
      label: "모집·배정",
      value: slots.filter((s) => !s.participantId).length,
      note: "미배정 슬롯",
      tab: "assignment",
      icon: Users,
    },
    {
      label: "콘텐츠 검수",
      value: tasks.filter((t) =>
        ["review", "changes"].includes(String(t.status)),
      ).length,
      note: "검수·수정 대기",
      tab: "review",
      icon: FileText,
    },
    {
      label: "게시 확인",
      value: tasks.filter((t) => t.status === "verified").length,
      note: "확인 완료 작업",
      tab: "review",
      icon: Check,
    },
    {
      label: "지급 내역",
      value: tasks.filter((t) => t.payoutStatus === "paid").length,
      note: "지급 완료 작업",
      tab: "participants",
      icon: Clock3,
    },
  ];
  return (
    <div className={styles.workflowSteps} aria-label="캠페인 운영 요약">
      {steps.map((s) => (
        <button key={s.label} onClick={() => onTab(s.tab)}>
          <s.icon size={18} />
          <span>
            {s.label}
            <strong>
              {s.value}
              <small>{s.note}</small>
            </strong>
          </span>
          <ChevronRight size={14} />
        </button>
      ))}
    </div>
  );
}
