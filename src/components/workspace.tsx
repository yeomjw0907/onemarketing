"use client";
import KeywordEvidence from "./keyword-evidence";
import KeywordMetrics from "./keyword-metrics";
import type { NaverKeywordMetrics } from "@/lib/naver-keyword-schema";
import ProductUnderstandingReview, {
  KeywordConfirmation,
} from "./product-understanding";
import { clipDescription } from "@/lib/clip-description";
import CopyQualityReview from "./copy-quality-review";
import { requireCopyApproval } from "@/lib/copy-quality";
import DeletedCatalog from "./deleted-catalog";
import { Tabs, useDecisionDialog } from "./ui/workflow-ui";
import WorkflowConsole from "./workflow-console";
import { accountAssignable } from "@/lib/participant-account-policy";
import { shootingTargetOptions } from "@/lib/media-guidance";
import Participants from "./participants";
import SalesCartBuilder from "./sales-cart";
import WorkSlots from "./work-slots";
import { cartQuote } from "@/lib/sales-cart";
import Dashboard from "./dashboard";
import AiCosts from "./ai-costs";
import PostingSets from "./posting-sets";
import MaterialChecklist from "./material-checklist";
import CustomerDocuments from "./customer-documents";
import CustomerReportLinks from "./customer-report-links";
import JobMonitor from "./job-monitor";
import MediaBriefings, { type BriefingRequest } from "./media-briefings";
import { publishableCopy, orderedImages } from "@/lib/copy-format";
import {
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Layers,
  CheckCheck,
  Send,
  Settings,
  Plus,
  ArrowUpRight,
  ChevronRight,
  LogOut,
  Package,
  FolderOpen,
  X,
  RefreshCw,
  Download,
  Upload,
  Play,
  Check,
  Search,
} from "lucide-react";
import {
  kinds,
  stageLabels,
  money,
  type RecordData,
  type DatabaseView,
  type Kind,
} from "@/lib/types";
type Draft = Record<string, any>;
const empty = () =>
  Object.fromEntries(kinds.map((k) => [k, []])) as unknown as DatabaseView;
const menus = [
  ["overview", "현황", LayoutDashboard],
  ["customers", "고객·제품", Users],
  ["participants", "체험단 관리", Users],
  ["library", "자료실", FolderOpen],
  ["contracts", "계약·견적", FileText],
  ["workflow", "캠페인 운영", Layers],
  ["projects", "프로젝트", Layers],
  ["reviews", "검수함", CheckCheck],
  ["publishing", "게시·지급", Send],
  ["settings", "설정", Settings],
] as const;
const stages = [
  "materials",
  "planning",
  "brief_review",
  "producing",
  "review",
  "ready",
  "publishing",
  "completed",
];
const tabs = [
  "개요",
  "자료",
  "기획",
  "제작·검수",
  "전달·게시",
  "비용·기록",
  "생성 브리핑",
  "슬롯·배정",
];
const status = (value: unknown) =>
  stageLabels[String(value)] || String(value || "미정");
function Badge({ value }: { value: unknown }) {
  return (
    <span
      className={
        "badge " +
        (["approved", "verified", "completed", "succeeded", "paid"].includes(
          String(value),
        )
          ? "green"
          : [
                "review",
                "brief_review",
                "producing",
                "publishing",
                "running",
              ].includes(String(value))
            ? "blue"
            : ["failed", "changes", "uncertain"].includes(String(value))
              ? "orange"
              : "")
      }
    >
      {status(value)}
    </span>
  );
}
function Empty({
  title = "아직 등록된 항목이 없어요",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={32} />
      <h3>{title}</h3>
      {children || "새 항목을 등록해 업무를 시작하세요."}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current
      ?.querySelector<HTMLElement>("input,select,textarea,button")
      ?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const items = Array.from(
              panel.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
              ) || [],
            );
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "full" : ""}>
      <label>
        {label}
        {children}
      </label>
    </div>
  );
}
export default function Workspace() {
  const [catalogTab, setCatalogTab] = useState("active");
  const [briefingRequest, setBriefingRequest] = useState<BriefingRequest>();
  const customerUploads = useRef<{ category: string; file: File }[]>([]);
  const [email, setEmail] = useState<string | null | undefined>(undefined),
    [data, setData] = useState<DatabaseView>(empty),
    [page, setPage] = useState("overview"),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState(0),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(""),
    [draft, setDraft] = useState<Draft>({}),
    [config, setConfig] = useState<Draft>({}),
    [recommendations, setRecommendations] = useState<Draft[]>([]);
  async function api(url: string, options?: RequestInit) {
    const response = await fetch(url, options);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "요청에 실패했습니다.");
    return body;
  }
  async function load() {
    try {
      const auth = await api("/api/auth");
      setEmail(auth.email);
      if (auth.email) {
        setData(await api("/api/data"));
        try {
          setConfig(await api("/api/settings"));
        } catch {}
      }
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    const restore = () => {
      const q = new URLSearchParams(window.location.search);
      const next = q.get("page") || "overview";
      setPage(menus.some((m) => m[0] === next) ? next : "overview");
      setSelected(q.get("id") || "");
      setTab(0);
    };
    restore();
    window.addEventListener("popstate", restore);
    load();
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!email) return;
    const timer = setInterval(() => {
      if (!busy)
        api("/api/data")
          .then(setData)
          .catch((e: Error) => {
            setError("새로고침 실패: " + e.message);
          });
    }, 12000);
    return () => clearInterval(timer);
  }, [email, busy]);
  function navigate(next: string, id = "") {
    const q = new URLSearchParams({ page: next });
    if (id) q.set("id", id);
    window.history.pushState({}, "", `/?${q}`);
    setPage(next);
    setSelected(id);
    setQuery("");
    setFilter("");
    setTab(0);
    setError("");
  }
  function open(kind: string, values: Draft = {}) {
    customerUploads.current = [];
    setModal(kind);
    setError("");
    setRecommendations([]);
    setDraft(values);
  }
  async function mutate(body: Draft) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, key: crypto.randomUUID() }),
      });
      setData(await api("/api/data"));
      setToast("저장했어요");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
      return null;
    } finally {
      setBusy(false);
    }
  }
  const { confirm: confirmCatalogDelete, dialog: catalogDeleteDialog } =
    useDecisionDialog();
  async function deleteCatalog(row: RecordData) {
    const customer = row.kind === "customers";
    if (
      !(await confirmCatalogDelete(
        `${String(row.name)}을(를) 삭제할까요? ${customer ? "하위 제품도 함께 목록에서 제외됩니다. " : ""}기존 견적·프로젝트·정산 기록은 보존됩니다.`,
      ))
    )
      return;
    const result = await action(
      customer ? "customer-delete" : "product-delete",
      row,
    );
    if (result && customer) navigate("customers");
  }
  async function action(name: string, row: RecordData, extra: Draft = {}) {
    return mutate({
      action: name,
      data: { id: row.id, version: row.version, ...extra },
    });
  }
  async function saveForm(event: FormEvent) {
    event.preventDefault();
    let kind = modal;
    let values = { ...draft };
    if (modal === "contracts") {
      values.vatIncluded = values.taxChoice === "inclusive";
      if (values.cartMode) values.lines = [];
      else delete values.packages;
    }
    const id = values.id,
      version = values.version;
    delete values.id;
    delete values.version;
    if (modal === "confirmCost") {
      const r = await action(
        "confirm-cost",
        data.costs.find((c) => c.id === id)!,
        values,
      );
      if (r) setModal("");
      return;
    }
    if (modal === "jobResolution") {
      const r = await action(
        "resolve-job",
        data.jobs.find((j) => j.id === id)!,
        values,
      );
      if (r) setModal("");
      return;
    }
    if (modal === "task") {
      const r = await action(
        "task-edit",
        data.tasks.find((t) => t.id === id)!,
        values,
      );
      if (r) setModal("");
      return;
    }
    if (modal === "publication") {
      const r = await action(
        "publication",
        data.tasks.find((t) => t.id === id)!,
        values,
      );
      if (r) setModal("");
      return;
    }
    if (modal === "cost") {
      const r = await action(
        "cost",
        data.projects.find((p) => p.id === id)!,
        values,
      );
      if (r) setModal("");
      return;
    }
    if (modal === "notes") {
      const r = await action(
        "project-notes",
        data.projects.find((p) => p.id === id)!,
        values,
      );
      if (r) setModal("");
      return;
    }
    if (modal === "feedback") {
      const r = await action(
        "request-changes",
        data.tasks.find((t) => t.id === id)!,
        values,
      );
      if (r) setModal("");
      return;
    }
    if (modal === "content") {
      if (find("tasks", draft.taskId)?.channel === "clip") {
        const check = clipDescription(String(values.text || ""));
        if (!check.valid) {
          setError(check.errors.join(" "));
          return;
        }
        values.text = check.text;
      }
      setBusy(true);
      try {
        await api("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        setData(await api("/api/data"));
        setModal("");
        setToast("원고를 저장했어요");
      } catch (e) {
        setError(e instanceof Error ? e.message : "실패");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (kind === "prices" && values.channel === "blog") {
      values.duration = 0;
      values.mode = "slideshow";
    }
    const r = await mutate({ kind, data: values, id, version });
    if (r) {
      if (kind === "customers") {
        setBusy(true);
        try {
          while (customerUploads.current.length) {
            const next = customerUploads.current[0];
            if (next.file.size > 4 * 1024 * 1024)
              throw new Error(
                "고객은 저장됐습니다. 첨부파일은 4MB 이하로 다시 선택하세요.",
              );
            const form = new FormData();
            form.set("file", next.file);
            form.set("customerId", r.id);
            form.set("category", next.category);
            await api("/api/customer-files", { method: "POST", body: form });
            customerUploads.current.shift();
          }
          setData(await api("/api/data"));
          navigate("customers", r.id);
        } catch (e) {
          setDraft({ ...r });
          setError(
            "고객 저장 완료 · 첨부자료 등록 실패: " +
              (e instanceof Error ? e.message : "다시 시도하세요."),
          );
          return;
        } finally {
          setBusy(false);
        }
      }
      setModal("");
      if (kind === "projects") navigate("projects", r.id);
    }
  }
  function input(key: string, type = "text", placeholder = "") {
    return (
      <input
        type={type}
        placeholder={placeholder}
        value={draft[key] ?? ""}
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]:
              type === "number"
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value,
          })
        }
      />
    );
  }
  function area(key: string, placeholder = "") {
    return (
      <textarea
        placeholder={placeholder}
        value={draft[key] || ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    );
  }
  function select(key: string, items: { id: string; name: unknown }[]) {
    return (
      <select
        value={draft[key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      >
        <option value="">선택하세요</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {String(i.name)}
          </option>
        ))}
      </select>
    );
  }
  const find = (kind: Kind, id: unknown) => data[kind].find((r) => r.id === id);
  const pname = (id: unknown) => String(find("projects", id)?.name || "");
  const cname = (id: unknown) => String(find("customers", id)?.name || "");
  let cartPreview: ReturnType<typeof cartQuote> | null = null;
  if (draft.cartMode) {
    try {
      cartPreview = cartQuote(
        data.prices,
        draft.packages || [],
        Number(draft.discount || 0),
        {
          blog:
            Number(config.defaultEstimates?.copy || 500) +
            3 * Number(config.defaultEstimates?.image || 2000),
          clip: Number(config.defaultEstimates?.video || 15000),
        },
      );
    } catch {}
  }
  const previewSale = draft.cartMode
    ? cartPreview?.sale || 0
    : (draft.lines || []).reduce(
        (sum: number, line: Draft) =>
          sum +
          Number(find("prices", line.priceId)?.sale || 0) *
            Number(line.quantity),
        0,
      ) - Number(draft.discount || 0);
  const previewNet =
    draft.taxChoice === "inclusive"
      ? Math.round(previewSale / 1.1)
      : previewSale;
  const previewKnown = (draft.lines || []).every((line: Draft) => {
    const price = find("prices", line.priceId);
    return price && price.payout !== null && price.aiEstimate !== null;
  });
  const previewCost = draft.cartMode
    ? (cartPreview?.cost ?? null)
    : previewKnown
      ? (draft.lines || []).reduce((sum: number, line: Draft) => {
          const price = find("prices", line.priceId)!;
          return (
            sum +
            (Number(price.payout) + Number(price.aiEstimate)) *
              Number(line.quantity)
          );
        }, 0)
      : null;
  const filtered = (rows: RecordData[]) =>
    rows.filter(
      (r) =>
        !query || JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
    );
  const project = find("projects", selected),
    customer = data.customers.find((c) => c.id === selected && !c.deletedAt);
  const tasks = data.tasks
    .filter((t) => t.projectId === selected)
    .sort((a, b) => Number(a.order) - Number(b.order));
  const costSummary = (p: RecordData) => {
    const payout = data.tasks
      .filter(
        (t) =>
          t.projectId === p.id &&
          (t.status !== "cancelled" ||
            t.payoutStatus === "paid" ||
            t.payoutCommitted === true),
      )
      .reduce((n, t) => n + Number(t.payout || 0), 0);
    const incurred = data.costs
      .filter((c) => c.projectId === p.id)
      .reduce((n, c) => n + Number(c.amount), 0);
    const aiSpent = data.costs
      .filter((c) => c.projectId === p.id && c.category === "ai")
      .reduce((n, c) => n + Number(c.amount), 0);
    const remaining = Math.max(0, Number(p.aiEstimate) - aiSpent);
    return {
      payout,
      incurred,
      total: payout + incurred,
      margin: Number(p.sale) - payout - incurred,
      remaining,
      forecast: Number(p.sale) - payout - incurred - remaining,
    };
  };
  const button = (
    text: string,
    fn: () => void,
    primary = false,
    disabled = false,
  ) => (
    <button
      type="button"
      disabled={busy || disabled}
      className={primary ? "primary" : ""}
      onClick={fn}
    >
      {text}
    </button>
  );
  const newProject = (contract?: RecordData) =>
    open("projects", {
      name: "",
      contractId: contract?.id || "",
      productId: "",
      slot: 0,
      due: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      instructions: "",
      budget: contract?.aiEstimate || 15000,
    });
  async function upload(
    projectId: string,
    taskId?: string,
    category = "source",
  ) {
    const element = document.createElement("input");
    element.type = "file";
    element.accept =
      category === "video"
        ? ".mp4"
        : category === "source"
          ? ".pdf,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png,.webp"
          : ".jpg,.jpeg,.png,.webp";
    element.onchange = async () => {
      const file = element.files?.[0];
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("projectId", projectId);
        form.set("category", category);
        if (taskId) form.set("taskId", taskId);
        await api("/api/assets", { method: "POST", body: form });
        setData(await api("/api/data"));
        setToast("파일을 등록했어요");
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드 실패");
      } finally {
        setBusy(false);
      }
    };
    element.click();
  }
  async function generate(
    type: string,
    p: RecordData,
    task?: RecordData,
    replaceAssetId?: string,
    copySourceAssetId?: string,
  ) {
    if ((type === "image" || type === "video") && task) {
      navigate("projects", p.id);
      setBriefingRequest({
        taskId: task.id,
        mediaType: type,
        replaceAssetId,
        nonce: Date.now(),
      });
      setTab(6);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: p.id,
          taskId: task?.id,
          replaceAssetId,
          copySourceAssetId,
          type,
          key: crypto.randomUUID(),
          estimate:
            (config.defaultEstimates?.[type] || 1000) *
            (type === "copy" ? (copySourceAssetId ? 4 : 5) : 1),
        }),
      });
      setData(await api("/api/data"));
      setToast("제작 작업을 등록했어요. 작업 서버에서 순서대로 처리합니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }
  async function refreshNaverMetrics(p: RecordData) {
    setBusy(true);
    setError("");
    try {
      await api("/api/keyword-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, version: p.version }),
      });
      setData(await api("/api/data"));
      setToast(
        "네이버 데이터를 조회했어요. 확인 후 고객 공유 내용을 다시 확정해주세요.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "네이버 조회 실패");
    } finally {
      setBusy(false);
    }
  }
  function Assets({ rows }: { rows: RecordData[] }) {
    return (
      <div className="assets">
        {rows.map((a) => (
          <div
            className={"asset" + (a.category === "copy" ? " asset-copy" : "")}
            key={a.id}
          >
            {["image", "source"].includes(String(a.category)) &&
            String(a.mime).startsWith("image/") ? (
              <img src={"/api/assets/" + a.id} alt={String(a.name)} />
            ) : a.category === "video" ? (
              <video controls src={"/api/assets/" + a.id} />
            ) : a.category === "copy" ? (
              <div className="content-preview">
                {find("tasks", a.taskId)?.channel === "clip"
                  ? clipDescription(String(a.text || "")).text
                  : publishableCopy(String(a.text || ""))}
              </div>
            ) : (
              <FileText />
            )}
            <small>{String(a.name)}</small>
            {a.category === "copy" &&
              find("tasks", a.taskId)?.channel === "clip" && (
                <p className="hint">
                  설명 {clipDescription(String(a.text || "")).length}/300자 ·
                  해시태그{" "}
                  {clipDescription(String(a.text || "")).hashtags.length}/5개 ·{" "}
                  {clipDescription(String(a.text || "")).errors.join(" ") ||
                    "기준 충족"}
                </p>
              )}
            {a.category === "image" && a.current === true && (
              <span className="badge blue">
                이미지{" "}
                {orderedImages(data.assets, a.taskId).findIndex(
                  (i) => i.id === a.id,
                ) + 1}
              </span>
            )}
            {a.category === "copy" && (
              <>
                <CopyQualityReview
                  asset={a}
                  busy={busy}
                  previous={
                    data.assets
                      .filter(
                        (old) =>
                          old.id !== a.id &&
                          old.taskId === a.taskId &&
                          old.category === "copy" &&
                          old.createdAt <= a.createdAt,
                      )
                      .sort((left, right) =>
                        right.createdAt.localeCompare(left.createdAt),
                      )[0]
                  }
                  onReview={
                    a.current === true &&
                    find("tasks", a.taskId) &&
                    ![
                      "approved",
                      "delivered",
                      "submitted",
                      "verified",
                    ].includes(String(find("tasks", a.taskId)?.status))
                      ? () =>
                          void generate(
                            "copy",
                            find("projects", a.projectId)!,
                            find("tasks", a.taskId),
                            undefined,
                            a.id,
                          )
                      : undefined
                  }
                />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        find("tasks", a.taskId)?.channel === "clip"
                          ? clipDescription(String(a.text || "")).text
                          : publishableCopy(String(a.text || "")),
                      );
                      setToast("원고를 복사했어요");
                    } catch {
                      setError(
                        "복사하지 못했습니다. 원고를 선택해 직접 복사해주세요.",
                      );
                    }
                  }}
                >
                  원고 복사
                </button>
                {a.editorialNotes ? (
                  <details>
                    <summary>운영자 확인 사항</summary>
                    <p>{String(a.editorialNotes)}</p>
                  </details>
                ) : null}
              </>
            )}
            <a
              href={
                "/api/assets/" +
                a.id +
                (a.category === "copy" ? "?publishable=1" : "")
              }
              target="_blank"
              rel="noreferrer"
            >
              열기 ↗
            </a>
            {a.common === true && (
              <span className="badge blue">공통 필수 이미지</span>
            )}
            {a.similarWarning === true && (
              <span className="badge orange">
                다른 글 이미지와 유사 · 확인 필요
              </span>
            )}
            {a.category === "image" &&
              a.current === true &&
              a.common !== true &&
              button("이 이미지 새 버전 생성", () =>
                generate(
                  "image",
                  find("projects", a.projectId)!,
                  find("tasks", a.taskId),
                  a.id,
                ),
              )}
            {a.category === "source" && (
              <button
                disabled={busy}
                onClick={() =>
                  void action("product-source-toggle", a, {
                    excluded: a.analysisExcluded !== true,
                  })
                }
              >
                {a.analysisExcluded === true
                  ? "제품 분석에 포함"
                  : "제품 분석에서 제외"}
              </button>
            )}
            {a.analysisExcluded === true && (
              <span className="badge">제품 분석 제외</span>
            )}
            {a.category === "source" &&
              String(a.mime).startsWith("image/") &&
              button("공통 이미지로 배정", () => action("assign-common", a))}
            {a.extracted ? (
              <details>
                <summary>자료 내용 미리보기</summary>
                <pre className="content-preview">{String(a.extracted)}</pre>
                {button("자료 메모에 반영", () =>
                  open("notes", {
                    ...find("projects", a.projectId),
                    materialNotes: String(a.extracted).slice(0, 10000),
                  }),
                )}
              </details>
            ) : null}
            {a.current === false && <span className="badge">이전 버전</span>}
          </div>
        ))}
      </div>
    );
  }
  function TaskList({
    rows,
    review = false,
  }: {
    rows: RecordData[];
    review?: boolean;
  }) {
    return rows.length ? (
      <>
        {rows.map((t) => (
          <div className="task" key={t.id}>
            <div className="task-head">
              <div>
                <h3>
                  {String(t.name)} <Badge value={t.status} />
                </h3>
                <span className="muted">
                  {pname(t.projectId)} ·{" "}
                  {t.channel === "blog"
                    ? `이미지 ${t.images}장`
                    : `${t.mode === "slideshow" ? "슬라이드형" : "AI 생성형"} · ${t.duration}초`}{" "}
                  ·{" "}
                  {t.postingSetId
                    ? "세트 통합 보수에 포함"
                    : `지급 ${money(t.payout)}`}
                </span>
              </div>
              <div className="row">
                {button("편집", () => open("task", { ...t }))}
                {review &&
                  button(
                    t.channel === "clip" ? "설명 원고 입력" : "원고 입력",
                    () =>
                      open("content", {
                        projectId: t.projectId,
                        taskId: t.id,
                        text: "",
                        category: "copy",
                      }),
                  )}
                {review &&
                  button("이미지 등록", () =>
                    upload(String(t.projectId), t.id, "image"),
                  )}
                {review &&
                  t.channel === "clip" &&
                  button("영상 등록", () =>
                    upload(String(t.projectId), t.id, "video"),
                  )}
              </div>
            </div>
            {t.feedback ? (
              <div className="notice">수정 의견: {String(t.feedback)}</div>
            ) : null}
            {t.brief ? (
              <pre>{String(t.brief)}</pre>
            ) : (
              <p className="hint">콘셉트와 소구점을 먼저 작성하세요.</p>
            )}
            {review && (
              <Assets
                rows={data.assets.filter(
                  (a) =>
                    a.taskId === t.id &&
                    a.current === true &&
                    a.category !== "source",
                )}
              />
            )}
            {review && (
              <div className="row">
                {button("원고 생성", () =>
                  generate("copy", find("projects", t.projectId)!, t),
                )}
                {button("이미지 브리핑", () =>
                  generate("image", find("projects", t.projectId)!, t),
                )}
                {t.channel === "clip" &&
                  button(
                    t.mode === "slideshow" ? "슬라이드 제작" : "영상 브리핑",
                    () =>
                      generate(
                        t.mode === "slideshow" ? "slideshow" : "video",
                        find("projects", t.projectId)!,
                        t,
                      ),
                  )}
                {button("수정 요청", () =>
                  open("feedback", { id: t.id, feedback: "" }),
                )}
                {button(
                  "결과물 승인",
                  () => action("approve-task", t),
                  true,
                  (() => {
                    try {
                      requireCopyApproval(
                        data.assets.filter(
                          (a) => a.taskId === t.id && a.current === true,
                        ),
                        find("projects", t.projectId),
                      );
                      return false;
                    } catch {
                      return true;
                    }
                  })(),
                )}
              </div>
            )}
          </div>
        ))}
      </>
    ) : (
      <Empty />
    );
  }
  function Publications({ rows }: { rows: RecordData[] }) {
    return (
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {["작업 / 프로젝트", "담당자", "게시 상태", "지급액", "작업"].map(
                (t) => (
                  <th key={t}>{t}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{String(t.name)}</strong>
                  <small>{pname(t.projectId)}</small>
                  {t.link ? (
                    <a href={String(t.link)} target="_blank" rel="noreferrer">
                      게시물 열기 ↗
                    </a>
                  ) : null}
                </td>
                <td>
                  {t.participantId
                    ? button(String(t.assignee || "체험단"), () =>
                        navigate("participants", String(t.participantId)),
                      )
                    : String(t.assignee || "미배정")}
                </td>
                <td>
                  <Badge value={t.status} />
                </td>
                <td>
                  {t.postingSetId ? "세트 통합 보수" : money(t.payout)}
                  <small>
                    {t.payoutStatus === "paid" ? "지급 완료" : "지급 예정"}
                  </small>
                </td>
                <td>
                  <div className="row">
                    {button("링크·확인", () =>
                      open("publication", {
                        ...t,
                        verified: t.status === "verified",
                      }),
                    )}
                    {t.postingSetId
                      ? button("세트 지급 관리", () => {
                          navigate("projects", String(t.projectId));
                          setTab(4);
                        })
                      : button(
                          t.payoutStatus === "paid" ? "지급 취소" : "지급 완료",
                          () =>
                            action("payout", t, {
                              paid: t.payoutStatus !== "paid",
                            }),
                        )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty />}
      </div>
    );
  }
  if (email === undefined)
    return (
      <div className="login">
        <p className="muted">작업 공간을 불러오는 중이에요…</p>
      </div>
    );
  if (!email)
    return (
      <div className="login">
        <form
          className="loginbox"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await api("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: f.get("email"),
                  password: f.get("password"),
                }),
              });
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "로그인 실패");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="brand">
            <span className="brand-mark">o</span>one marketing
          </div>
          <h1>운영자 로그인</h1>
          <p className="muted">마케팅 작업을 이어서 진행하세요.</p>
          <label htmlFor="email">이메일</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "확인 중…" : "로그인"}
          </button>
        </form>
      </div>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">o</span>one marketing
        </div>
        <nav>
          {menus.map(([key, label, Icon]) => (
            <button
              key={key}
              className={"nav " + (page === key ? "active" : "")}
              onClick={() => navigate(key)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="account">
          <strong>운영자</strong>
          <div>{email}</div>
          <button
            onClick={async () => {
              await api("/api/auth", { method: "DELETE" });
              setEmail(null);
              setData(empty());
            }}
          >
            <LogOut size={14} />
            로그아웃
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <span>
            WORKSPACE / <strong>{menus.find((m) => m[0] === page)?.[1]}</strong>
          </span>
          <div className="row">
            <span>
              {new Date().toLocaleDateString("ko-KR", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <button aria-label="새로고침" onClick={load}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        {error && !modal && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {page === "workflow" && (
          <WorkflowConsole
            data={data}
            onReload={async () => setData(await api("/api/data"))}
          />
        )}
        {page === "overview" && (
          <>
            <Dashboard
              onReload={async () => setData(await api("/api/data"))}
              data={data}
              onNew={newProject}
              onOpen={(id, nextTab) => {
                navigate("projects", id);
                setTab(nextTab);
              }}
            />
          </>
        )}
        {page === "participants" && (
          <Participants
            data={data}
            selected={selected}
            onSelect={(id) => navigate("participants", id)}
            onProject={(id) => navigate("projects", id)}
            onReload={load}
          />
        )}
        {page === "library" && (
          <>
            <div className="pagehead">
              <div>
                <h1>자료실</h1>
                <p>고객 작성 양식과 고객별 참고자료를 보관하세요.</p>
              </div>
            </div>
            <CustomerDocuments
              customers={data.customers}
              assets={data.assets}
              projects={data.projects}
              onReload={async () => setData(await api("/api/data"))}
            />
          </>
        )}
        {page === "customers" && !customer && (
          <>
            <div className="pagehead">
              <div>
                <h1>고객·제품</h1>
                <p>브랜드 기준과 제품 자료를 쌓아두세요.</p>
              </div>
              <button
                className="primary"
                onClick={() =>
                  open("customers", {
                    name: "",
                    brand: "",
                    contact: "",
                    tone: "",
                    target: "",
                    forbidden: "",
                    notes: "",
                  })
                }
              >
                <Plus size={17} />
                고객 등록
              </button>
            </div>
            <Tabs
              label="고객·제품 목록"
              value={catalogTab}
              onChange={setCatalogTab}
              items={[
                { id: "active", label: "등록된 고객" },
                {
                  id: "deleted",
                  label: "삭제된 목록",
                  count:
                    data.customers.filter((c) => c.deletedAt).length +
                    data.products.filter((p) => p.deletedAt).length,
                },
              ]}
            />
            {catalogTab === "deleted" ? (
              <DeletedCatalog
                data={data}
                busy={busy}
                onRestore={async (row) => {
                  if (
                    await confirmCatalogDelete(
                      `${String(row.name)}을(를) 복원할까요? ${row.kind === "customers" ? "이 고객과 함께 삭제된 제품도 복원됩니다. 따로 삭제했던 제품은 그대로 유지됩니다." : "고객의 제품 목록에서 다시 사용할 수 있습니다."}`,
                    )
                  )
                    await action(
                      row.kind === "customers"
                        ? "customer-restore"
                        : "product-restore",
                      row,
                    );
                }}
              />
            ) : (
              <>
                <div className="toolbar">
                  <input
                    placeholder="고객명·브랜드 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>고객 / 브랜드</th>
                        <th>연락처</th>
                        <th>등록 제품</th>
                        <th>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered(data.customers.filter((c) => !c.deletedAt)).map(
                        (c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{String(c.name)}</strong>
                              <small>{String(c.brand)}</small>
                            </td>
                            <td>{String(c.contact || "—")}</td>
                            <td>
                              {
                                data.products.filter(
                                  (p) => p.customerId === c.id && !p.deletedAt,
                                ).length
                              }
                              개
                            </td>
                            <td>
                              {button("상세 보기", () =>
                                navigate("customers", c.id),
                              )}
                              <button
                                disabled={busy}
                                onClick={() => void deleteCatalog(c)}
                              >
                                고객 삭제
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                  {!data.customers.some((c) => !c.deletedAt) && <Empty />}
                </div>
              </>
            )}
          </>
        )}
        {page === "customers" && customer && (
          <>
            <div className="pagehead catalog-detail-header">
              <div>
                <button onClick={() => navigate("customers")}>
                  ← 고객 목록
                </button>
                <h1 style={{ marginTop: 16 }}>{String(customer.name)}</h1>
                <p>{String(customer.brand || "브랜드 정보 미등록")}</p>
              </div>
              <div className="row">
                {button("고객 정보 수정", () =>
                  open("customers", { ...customer }),
                )}
                <button
                  disabled={busy}
                  onClick={() => void deleteCatalog(customer)}
                >
                  고객 삭제
                </button>
              </div>
            </div>
            <div className="split">
              <section className="section">
                <h2>브랜드 제작 기준</h2>
                {[
                  ["말투", customer.tone],
                  ["타깃", customer.target],
                  ["피해야 할 표현", customer.forbidden],
                  ["연락처", customer.contact],
                  ["사업자등록번호", customer.businessNumber],
                ].map(([k, v]) => (
                  <div className="amountline" key={String(k)}>
                    <span className="muted">{String(k)}</span>
                    <span>{String(v || "미등록")}</span>
                  </div>
                ))}
              </section>
              <section className="section">
                <h2>고객 현황</h2>
                <p>
                  계약{" "}
                  {
                    data.contracts.filter((c) => c.customerId === customer.id)
                      .length
                  }
                  건 · 프로젝트{" "}
                  {
                    data.projects.filter((c) => c.customerId === customer.id)
                      .length
                  }
                  건
                </p>
                <p className="muted">
                  고객 정보 변경은 이전 프로젝트의 제작 기준을 바꾸지 않아요.
                </p>
              </section>
            </div>
            <CustomerReportLinks
              key={"report:" + customer.id}
              customerId={customer.id}
              links={data.report_links}
              onReload={async () => setData(await api("/api/data"))}
            />
            <CustomerDocuments
              key={customer.id}
              customerId={customer.id}
              customers={data.customers}
              assets={data.assets}
              projects={data.projects}
              onReload={async () => setData(await api("/api/data"))}
            />
            <div className="section-title">
              <h2>제품 목록</h2>
              {button(
                "제품 등록",
                () =>
                  open("products", {
                    name: "",
                    customerId: customer.id,
                    facts: "",
                    claims: "",
                    forbidden: "",
                    preserve: "",
                    notes: "",
                  }),
                true,
              )}
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>제품명</th>
                    <th>제품 정보</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products
                    .filter((p) => p.customerId === customer.id && !p.deletedAt)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{String(p.name)}</strong>
                        </td>
                        <td>{String(p.facts).slice(0, 80) || "미등록"}</td>
                        <td className="catalog-actions">
                          {button("자료·규칙 수정", () =>
                            open("products", { ...p }),
                          )}
                          <button
                            disabled={busy}
                            onClick={() => void deleteCatalog(p)}
                          >
                            제품 삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {page === "contracts" && (
          <>
            <div className="pagehead">
              <div>
                <h1>계약·견적</h1>
                <p>고객의 목적과 예산에 맞게 구성을 확정하세요.</p>
              </div>
              <button
                className="primary"
                onClick={() =>
                  open("contracts", {
                    name: "",
                    customerId: "",
                    cartMode: true,
                    packages: [],
                    blogPriceId:
                      data.prices.find(
                        (p) =>
                          p.channel === "blog" &&
                          p.images === 3 &&
                          Number(p.sale) > 0,
                      )?.id ||
                      data.prices.find(
                        (p) => p.channel === "blog" && p.images === 3,
                      )?.id ||
                      "",
                    clipPriceId:
                      data.prices.find(
                        (p) =>
                          p.channel === "clip" &&
                          p.duration === 10 &&
                          p.mode === "generated" &&
                          Number(p.sale) > 0,
                      )?.id ||
                      data.prices.find(
                        (p) =>
                          p.channel === "clip" &&
                          p.duration === 10 &&
                          p.mode === "generated",
                      )?.id ||
                      "",
                    lines: data.prices.length
                      ? [{ priceId: data.prices[0].id, quantity: 1 }]
                      : [],
                    discount: 0,
                    months: 1,
                    setsPerMonth: 1,
                    taxChoice: "exclusive",
                    startMonth: new Date().toISOString().slice(0, 7),
                    vatIncluded: false,
                    budget: null,
                    inputMode: "quantity",
                  })
                }
              >
                <Plus size={17} />
                견적 만들기
              </button>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>계약 / 고객</th>
                    <th>진행 회차당 판매액</th>
                    <th>제공 계획</th>
                    <th>진행</th>
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contracts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{String(c.name)}</strong>
                        <small>{cname(c.customerId)}</small>
                      </td>
                      <td>
                        {money(c.sale)}
                        <small>공급가액 · VAT {money(c.vat)}</small>
                      </td>
                      <td>
                        {String(c.months)}개월 × 월 {String(c.setsPerMonth)}회
                        {Array.isArray(c.packageSnapshots) && (
                          <small>
                            {(c.packageSnapshots as Draft[])
                              .map((p) => `${p.label} × ${p.quantity}`)
                              .join(" · ")}
                          </small>
                        )}
                      </td>
                      <td>
                        {
                          data.projects.filter((p) => p.contractId === c.id)
                            .length
                        }{" "}
                        / {String(c.slotCount)} 시작
                      </td>
                      <td>{button("프로젝트 시작", () => newProject(c))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.contracts.length && (
                <Empty title="첫 견적을 만들어 보세요">
                  설정에서 판매·지급 단가를 먼저 입력하면 마진을 계산할 수
                  있어요.
                </Empty>
              )}
            </div>
          </>
        )}
        {page === "projects" && !project && (
          <>
            <div className="pagehead">
              <div>
                <h1>프로젝트</h1>
                <p>제작부터 게시 확인까지 진행 상황을 확인하세요.</p>
              </div>
              <button className="primary" onClick={() => newProject()}>
                <Plus size={17} />
                프로젝트 시작
              </button>
            </div>
            <div className="toolbar">
              <input
                placeholder="프로젝트·고객 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">모든 단계</option>
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {status(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>프로젝트 / 고객</th>
                    <th>진행 단계</th>
                    <th>납기</th>
                    <th>게시 확인</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered(data.projects)
                    .filter((p) => !filter || p.status === filter)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{String(p.name)}</strong>
                          <small>{cname(p.customerId)}</small>
                        </td>
                        <td>
                          <Badge value={p.status} />
                        </td>
                        <td>{String(p.due)}</td>
                        <td>
                          {
                            data.tasks.filter(
                              (t) =>
                                t.projectId === p.id && t.status === "verified",
                            ).length
                          }{" "}
                          /{" "}
                          {
                            data.tasks.filter((t) => t.projectId === p.id)
                              .length
                          }
                        </td>
                        <td>
                          {button("열기", () => {
                            navigate("projects", p.id);
                            setTab(0);
                          })}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!data.projects.length && <Empty />}
            </div>
          </>
        )}
        {page === "projects" && project && (
          <>
            <div className="pagehead">
              <div>
                <button onClick={() => navigate("projects")}>
                  ← 프로젝트 목록
                </button>
                <h1 style={{ marginTop: 16 }}>{String(project.name)}</h1>
                <p>
                  {cname(project.customerId)} ·{" "}
                  {String(find("products", project.productId)?.name)} · 납기{" "}
                  {String(project.due)}
                </p>
              </div>
              <div className="row">
                <Badge value={project.status} />
                {button("체험단 빠른 배정", () => setTab(7))}
                {button("자료·예산 메모", () => open("notes", { ...project }))}
              </div>
            </div>
            <div className="stepbar">
              {stages.map((s, i) => (
                <span
                  key={s}
                  className={
                    i <= stages.indexOf(String(project.status)) ? "done" : ""
                  }
                />
              ))}
            </div>
            <div className="tabs">
              {tabs.map((t, i) => (
                <button
                  key={t}
                  className={i === tab ? "active" : ""}
                  onClick={() => setTab(i)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === 0 && (
              <div className="split">
                <section className="section">
                  <h2>다음 단계</h2>
                  <p className="muted">
                    현재 {status(project.status)} 단계예요. 필요한 작업을 마친
                    뒤 진행하세요.
                  </p>
                  <div className="row">
                    {stages.indexOf(String(project.status)) <
                      stages.length - 1 &&
                      button(
                        "다음 단계: " +
                          status(
                            stages[stages.indexOf(String(project.status)) + 1],
                          ),
                        () =>
                          action("project-stage", project, {
                            status:
                              stages[
                                stages.indexOf(String(project.status)) + 1
                              ],
                          }),
                        true,
                      )}
                    {project.status === "brief_review" &&
                      button("기획 수정", () =>
                        action("project-stage", project, {
                          status: "planning",
                        }),
                      )}
                  </div>
                  <h3 style={{ marginTop: 26 }}>프로젝트 요청</h3>
                  <p>{String(project.instructions || "별도 요청 없음")}</p>
                  <h3>등록 자료 메모</h3>
                  <p>{String(project.materialNotes || "미등록")}</p>
                </section>
                <section className="section">
                  <h2>금액 요약</h2>
                  <div className="amountline">
                    <span>판매액</span>
                    <strong>{money(project.sale)}</strong>
                  </div>
                  <div className="amountline">
                    <span>예상 지급액</span>
                    <strong>{money(project.payoutEstimate)}</strong>
                  </div>
                  <div className="amountline">
                    <span>예상 AI 비용</span>
                    <strong>{money(project.aiEstimate)}</strong>
                  </div>
                  <div className="amountline total">
                    <span>예상 마진</span>
                    <strong>
                      {money(
                        Number(project.sale) -
                          Number(project.payoutEstimate) -
                          Number(project.aiEstimate),
                      )}
                    </strong>
                  </div>
                  <p className="hint">
                    기타 비용·인건비 반영 전. 판매액은 VAT 제외 기준이에요.
                  </p>
                </section>
              </div>
            )}
            {tab === 1 && (
              <>
                <MaterialChecklist
                  key={
                    project.id +
                    ":" +
                    project.version +
                    ":" +
                    data.assets.filter((a) => a.projectId === project.id).length
                  }
                  project={project}
                  assets={data.assets}
                  onSave={async (items) => {
                    const result = await action("materials-update", project, {
                      items,
                    });
                    if (!result)
                      throw new Error(
                        "체크리스트를 저장하지 못했습니다. 화면의 오류를 확인하세요.",
                      );
                    return result;
                  }}
                />
                <section className="section">
                  <div className="section-title">
                    <h2>고객 제공 자료</h2>
                    <button onClick={() => upload(project.id)} disabled={busy}>
                      <Upload size={16} />
                      소개서·엑셀·사진 등록
                    </button>
                  </div>
                  <p className="hint">
                    회사소개서·제품소개서는 PDF로, 고객 작성본은 엑셀로 등록할
                    수 있어요. 원본을 보존하고 자료 정리 후 제품별 사실을
                    확인해요. 고객 자료실의 참고자료도 이 프로젝트로
                    가져와주세요.
                  </p>
                  <Assets
                    rows={data.assets.filter(
                      (a) =>
                        a.projectId === project.id && a.category === "source",
                    )}
                  />
                  {!data.assets.some(
                    (a) =>
                      a.projectId === project.id && a.category === "source",
                  ) && <Empty title="소개서·엑셀·제품 사진을 등록하세요" />}
                  <details>
                    <summary>이 제품의 이전 자료 가져오기</summary>
                    {data.assets
                      .filter(
                        (a) =>
                          a.category === "source" &&
                          a.projectId !== project.id &&
                          find("projects", a.projectId)?.productId ===
                            project.productId &&
                          !data.assets.some(
                            (b) =>
                              b.projectId === project.id &&
                              b.category === "source" &&
                              b.hash === a.hash,
                          ),
                      )
                      .map((a) => (
                        <div className="amountline" key={a.id}>
                          <span>{String(a.name)}</span>
                          {button("가져오기", () =>
                            action("import-source", a, {
                              projectId: project.id,
                            }),
                          )}
                        </div>
                      ))}
                  </details>
                </section>
                <ProductUnderstandingReview
                  key={project.id + ":" + project.version}
                  project={project}
                  busy={busy}
                  onAction={(name, extra) => action(name, project, extra)}
                  onGenerate={() => void generate("product-review", project)}
                />
              </>
            )}
            {tab === 2 && (
              <section className="section keyword-planning">
                <div className="section-title">
                  <h2>게시물별 기획</h2>
                  <button
                    className="primary"
                    disabled={busy || !project.productUnderstandingCurrent}
                    onClick={() => void generate("research", project)}
                  >
                    키워드 분석·기획 생성
                  </button>
                </div>
                <p className="hint">
                  먼저 자료 탭에서 제품 정보를 정리하고 확정해주세요. 분석
                  결과는 내부 초안이며 고객 공유 확정 전에는 공개되지 않아요.
                </p>
                {project.preferredKeywords ? (
                  <p className="hint">
                    희망 키워드: {String(project.preferredKeywords)}
                  </p>
                ) : null}
                {project.recommendedKeywords ? (
                  <div className="keyword-analysis">
                    <strong>추천 키워드</strong>
                    <p>
                      핵심:{" "}
                      {(
                        ((project.recommendedKeywords as Draft)
                          .main as string[]) || []
                      ).join(", ")}
                    </p>
                    <p>
                      보조:{" "}
                      {(
                        ((project.recommendedKeywords as Draft)
                          .secondary as string[]) || []
                      ).join(", ")}
                    </p>
                    <p className="hint">
                      {String(
                        (project.recommendedKeywords as Draft).reason || "",
                      )}
                    </p>
                    <KeywordEvidence
                      plan={project.recommendedKeywords as Draft}
                    />
                    <button
                      disabled={busy || !project.productUnderstandingCurrent}
                      onClick={() => void refreshNaverMetrics(project)}
                    >
                      네이버 블로그·트렌드 데이터 조회
                    </button>
                    {project.keywordMetrics ? (
                      <KeywordMetrics
                        metrics={project.keywordMetrics as NaverKeywordMetrics}
                      />
                    ) : (
                      <p className="hint">
                        네이버 데이터를 조회하면 블로그 검색 문서 수·확인된 최근
                        글·검색 관심도 추이를 볼 수 있어요. 검색광고 API는
                        사용하지 않아요.
                      </p>
                    )}
                    <KeywordConfirmation
                      key={project.id + ":" + project.version}
                      project={project}
                      busy={busy}
                      onConfirm={(extra) =>
                        action("keyword-analysis-confirm", project, extra)
                      }
                    />
                  </div>
                ) : null}
                {project.research ? (
                  <pre className="content-preview">
                    {String(project.research)}
                  </pre>
                ) : null}
                <TaskList rows={tasks} />
              </section>
            )}
            {tab === 6 && (
              <MediaBriefings
                key={project.id}
                project={project}
                data={data}
                request={
                  briefingRequest &&
                  tasks.some((t) => t.id === briefingRequest.taskId)
                    ? briefingRequest
                    : undefined
                }
                estimates={config.defaultEstimates || {}}
                reload={async () => setData(await api("/api/data"))}
              />
            )}
            {tab === 7 && (
              <WorkSlots
                project={project}
                data={data}
                reload={async () => setData(await api("/api/data"))}
                onPublication={(t) =>
                  open("publication", {
                    ...t,
                    verified: t.status === "verified",
                    qualityScore: t.qualityScore ?? null,
                  })
                }
              />
            )}
            {tab === 3 && (
              <section className="section">
                <div className="section-title">
                  <h2>결과물 검수</h2>
                  <span className="hint">승인한 버전만 전달할 수 있어요.</span>
                </div>
                <TaskList rows={tasks} review />
              </section>
            )}
            {tab === 4 && (
              <>
                <PostingSets
                  key={project.id}
                  project={project}
                  data={data}
                  onReload={load}
                />
                <section className="section">
                  <div className="section-title">
                    <h2>승인본 전달</h2>
                    <a
                      href={"/api/deliveries?projectId=" + project.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <button>
                        <Download size={16} />
                        승인본 ZIP
                      </button>
                    </a>
                  </div>
                  <p className="muted">
                    ZIP 다운로드 후 실제로 전달한 작업을 기록하세요.
                  </p>
                  {button(
                    "전달 기록",
                    () =>
                      open("delivery", {
                        projectId: project.id,
                        taskIds: tasks
                          .filter((t) => t.status === "approved")
                          .map((t) => t.id),
                        channel: "카카오톡",
                        note: "",
                      }),
                    true,
                  )}
                  {data.deliveries
                    .filter((d) => d.projectId === project.id)
                    .map((d) => (
                      <div className="amountline" key={d.id}>
                        <span>
                          {new Date(d.createdAt).toLocaleString("ko-KR")}
                        </span>
                        <span>
                          {String(d.channel)} · {(d.taskIds as string[]).length}
                          건
                        </span>
                      </div>
                    ))}
                </section>
                <Publications rows={tasks} />
              </>
            )}
            {tab === 5 && (
              <>
                <AiCosts
                  data={data}
                  projectId={project.id}
                  onReload={async () => setData(await api("/api/data"))}
                />
                <div className="split">
                  <section className="section">
                    <div className="section-title">
                      <h2>발생 원가</h2>
                      {button("비용 추가", () =>
                        open("cost", {
                          id: project.id,
                          category: "other",
                          amount: 0,
                          description: "",
                          confirmed: true,
                        }),
                      )}
                    </div>
                    <div className="amountline">
                      <span>게시자 보수 · 미지급 포함</span>
                      <strong>{money(costSummary(project).payout)}</strong>
                    </div>
                    {data.costs
                      .filter((c) => c.projectId === project.id)
                      .map((c) => (
                        <div className="amountline" key={c.id}>
                          <span>
                            {String(c.description)}{" "}
                            {!c.confirmed && (
                              <>
                                <span className="badge orange">
                                  {(c.providerBilling as Draft)?.currency ===
                                  "USD"
                                    ? "원화 미환산"
                                    : "잠정"}
                                </span>{" "}
                                {button("금액 확정", () =>
                                  open("confirmCost", { ...c }),
                                )}
                              </>
                            )}
                          </span>
                          <strong>
                            {(c.providerBilling as Draft)?.currency === "USD"
                              ? `$${Number((c.providerBilling as Draft).amount).toFixed(6)} · 실제 USD / 원화 미환산`
                              : money(c.amount)}
                          </strong>
                        </div>
                      ))}
                    <div className="amountline total">
                      <span>원화 원가 · USD 미환산</span>
                      <strong>{money(costSummary(project).total)}</strong>
                    </div>
                    <p className="hint">
                      남은 AI 제작비는 별도입니다. 비용 확정 전 최종 마진이
                      아니에요.
                    </p>
                  </section>
                  <section className="section">
                    <h2>정산</h2>
                    <div className="amountline">
                      <span>잔여 AI 예상 비용</span>
                      <strong>{money(costSummary(project).remaining)}</strong>
                    </div>
                    <div className="amountline">
                      <span>현재 마진 전망</span>
                      <strong>{money(costSummary(project).forecast)}</strong>
                    </div>
                    <div className="amountline">
                      <span>현재 직접비 차감액</span>
                      <strong>{money(costSummary(project).margin)}</strong>
                    </div>
                    <p className="muted">
                      {project.settled
                        ? "정산 마감됨"
                        : "운영 완료 및 모든 비용 확정 후 마감할 수 있어요."}
                    </p>
                    {button("정산 마감", () => action("settle", project), true)}
                  </section>
                </div>
                <section className="section">
                  <h2>AI 실행 기록</h2>
                  {data.jobs
                    .filter((j) => j.projectId === project.id)
                    .map((j) => (
                      <div className="amountline" key={j.id}>
                        <span>
                          {String(j.type)} <Badge value={j.status} />
                          <small className="muted">
                            {" "}
                            {String(j.error || "")}
                          </small>
                        </span>
                        <div className="row">
                          <span>{money(j.estimate)}</span>
                          {["failed", "uncertain"].includes(String(j.status)) &&
                            button("처리 기록", () =>
                              open("jobResolution", { ...j, note: "" }),
                            )}
                          {["failed", "uncertain"].includes(String(j.status)) &&
                            Boolean(
                              (j.providerState as Draft)?.request_id ||
                              (j.providerState as Draft)?.response ||
                              j.searchState ||
                              j.outputText ||
                              Object.keys(j.copyCheckpoint || {}).length ||
                              Object.keys(j.checkpoints || {}).length,
                            ) &&
                            button("기존 요청 재조회", () =>
                              action("resume-job", j),
                            )}
                        </div>
                      </div>
                    ))}
                  <h2 style={{ marginTop: 25 }}>변경 기록</h2>
                  {data.events
                    .filter(
                      (e) =>
                        e.targetId === project.id ||
                        tasks.some((t) => t.id === e.targetId),
                    )
                    .slice(0, 25)
                    .map((e) => (
                      <div className="amountline" key={e.id}>
                        <span>{String(e.action)}</span>
                        <small className="muted">
                          {new Date(e.createdAt).toLocaleString("ko-KR")} ·{" "}
                          {String(e.actor)}
                        </small>
                      </div>
                    ))}
                </section>
              </>
            )}
          </>
        )}
        {page === "projects" && project && (
          <JobMonitor key={project.id} projectId={project.id} tasks={tasks} />
        )}
        {page === "reviews" && (
          <>
            <div className="pagehead">
              <div>
                <h1>검수함</h1>
                <p>여러 프로젝트의 결과물을 모아서 확인하세요.</p>
              </div>
            </div>
            <section className="section">
              <TaskList
                rows={data.tasks.filter((t) =>
                  ["review", "changes"].includes(String(t.status)),
                )}
                review
              />
            </section>
          </>
        )}
        {page === "publishing" && (
          <>
            <div className="pagehead">
              <div>
                <h1>게시·지급</h1>
                <p>게시물 확인과 지급 내역을 따로 관리하세요.</p>
              </div>
            </div>
            <div className="toolbar">
              <input
                placeholder="작업 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Publications rows={filtered(data.tasks)} />
          </>
        )}
        {page === "settings" && (
          <>
            <div className="pagehead">
              <div>
                <h1>운영 설정</h1>
                <p>단가와 제작 기준을 관리하세요.</p>
              </div>
              {button(
                "상품·단가 추가",
                () =>
                  open("prices", {
                    name: "",
                    channel: "blog",
                    sale: 0,
                    payout: null,
                    aiEstimate: null,
                    images: 3,
                    duration: 15,
                    mode: "slideshow",
                    revisions: 1,
                  }),
                true,
              )}
            </div>
            <section className="section">
              <h2>AI 연결 상태</h2>
              <div className="row">
                {["anthropic", "fal"].map((k) => (
                  <span
                    className={"badge " + (config[k] ? "green" : "orange")}
                    key={k}
                  >
                    {k} · {config[k] ? "키 설정됨" : "미설정"}
                  </span>
                ))}
              </div>
              <p className="hint">
                키는 서버의 .env.local에서 관리합니다. 키 설정은 실제 호출
                성공을 의미하지 않아요.
              </p>
            </section>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>상품 / 채널</th>
                    <th>판매가</th>
                    <th>지급액</th>
                    <th>수정</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prices.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{String(p.name)}</strong>
                        <small>
                          {p.channel === "blog"
                            ? "블로그"
                            : `클립 · ${p.mode === "slideshow" ? "슬라이드형" : p.mode === "hybrid" ? "혼합형" : "AI 생성형"}`}
                        </small>
                      </td>
                      <td>{money(p.sale)}</td>
                      <td>{money(p.payout)}</td>
                      <td>{button("수정", () => open("prices", { ...p }))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.prices.length && (
                <Empty title="판매가와 지급 단가를 등록하세요">
                  미정 단가를 0원으로 계산하지 않아요.
                </Empty>
              )}
            </div>
          </>
        )}
      </main>
      {catalogDeleteDialog}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          wide={modal === "contracts"}
          title={
            (
              {
                customers: "고객 정보",
                products: "제품 자료·규칙",
                prices: "상품·단가",
                contracts: "견적 만들기",
                projects: "프로젝트 시작",
                task: "작업·기획 편집",
                notes: "자료·예산 메모",
                cost: "발생 비용 등록",
                publication: "게시 링크·확인",
                feedback: "수정 요청",
                content: "원고 입력",
                delivery: "자료 전달 기록",
                confirmCost: "청구 비용 확정",
                jobResolution: "외부 실행 확인 기록",
              } as Draft
            )[modal]
          }
          onClose={() => {
            if (!busy) setModal("");
          }}
        >
          <form
            onSubmit={
              modal === "delivery"
                ? async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await api("/api/deliveries", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(draft),
                      });
                      setData(await api("/api/data"));
                      setModal("");
                      setToast("전달 기록을 저장했어요");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "실패");
                    } finally {
                      setBusy(false);
                    }
                  }
                : saveForm
            }
          >
            <div className="fields">
              {modal === "customers" && (
                <>
                  <Field label="고객명">{input("name")}</Field>
                  <Field label="사업자등록번호">
                    {input("businessNumber", "text", "000-00-00000")}
                  </Field>
                  <Field label="사업자등록증 · PDF/이미지, 최대 4MB" full>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        customerUploads.current =
                          customerUploads.current.filter(
                            (f) => f.category !== "business_registration",
                          );
                        const file = e.target.files?.[0];
                        if (file)
                          customerUploads.current.push({
                            category: "business_registration",
                            file,
                          });
                      }}
                    />
                  </Field>
                  <Field label="기타 참고자료 · 파일당 최대 4MB" full>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.txt,.md"
                      onChange={(e) => {
                        customerUploads.current =
                          customerUploads.current.filter(
                            (f) => f.category !== "reference",
                          );
                        customerUploads.current.push(
                          ...Array.from(e.target.files || []).map((file) => ({
                            category: "reference",
                            file,
                          })),
                        );
                      }}
                    />
                  </Field>
                  <p className="hint full">
                    첨부파일은 고객 저장 시 함께 등록됩니다. 작성된 Excel은
                    자료실에서 미리보기·다운로드할 수 있습니다.
                  </p>
                  <Field label="브랜드">{input("brand")}</Field>
                  <Field label="연락처" full>
                    {input("contact")}
                  </Field>
                  <Field label="타깃">{input("target")}</Field>
                  <Field label="말투">{input("tone")}</Field>
                  <Field label="피해야 할 표현" full>
                    {area("forbidden")}
                  </Field>
                  <Field label="내부 메모" full>
                    {area("notes")}
                  </Field>
                </>
              )}
              {modal === "products" && (
                <>
                  <Field label="제품명">{input("name")}</Field>
                  <Field label="고객">
                    {select(
                      "customerId",
                      data.customers
                        .filter((c) => !c.deletedAt)
                        .map((c) => ({ id: c.id, name: c.name })),
                    )}
                  </Field>
                  <Field label="확인된 제품 정보" full>
                    {area("facts", "규격, 성분, 사용법, 출처 등을 적어주세요.")}
                  </Field>
                  <Field label="강조점" full>
                    {area("claims")}
                  </Field>
                  <Field label="금지 표현">{area("forbidden")}</Field>
                  <Field label="유지할 외형 요소">{area("preserve")}</Field>
                  <Field label="메모" full>
                    {area("notes")}
                  </Field>
                </>
              )}
              {modal === "prices" && (
                <>
                  <Field label="상품명">{input("name")}</Field>
                  <Field label="채널">
                    {select("channel", [
                      { id: "blog", name: "블로그" },
                      { id: "clip", name: "클립" },
                    ])}
                  </Field>
                  <Field label="판매가">{input("sale", "number")}</Field>
                  <Field label="게시자 지급액 · 미정이면 빈칸">
                    {input("payout", "number")}
                  </Field>
                  <Field label="포함 이미지 수">
                    {input("images", "number")}
                  </Field>
                  {draft.channel === "clip" && (
                    <>
                      <Field label="영상 길이 · 초">
                        {input("duration", "number")}
                      </Field>
                      <Field label="영상 방식">
                        {select("mode", [
                          { id: "slideshow", name: "이미지 슬라이드형" },
                          { id: "hybrid", name: "혼합형" },
                          { id: "generated", name: "AI 생성형" },
                        ])}
                      </Field>
                    </>
                  )}
                  <Field label="포함 수정 횟수">
                    {input("revisions", "number")}
                  </Field>
                  <p className="hint full">
                    AI 사용 비용은 대시보드에서 이번 달 비용과 프로젝트당
                    평균으로 확인하세요. AI 예상비용이 미정인 견적은 예상 마진도
                    미정으로 표시합니다.
                  </p>
                </>
              )}
              {modal === "contracts" && (
                <>
                  <Field label="계약명">{input("name")}</Field>
                  <Field label="고객">
                    {select(
                      "customerId",
                      data.customers
                        .filter((c) => !c.deletedAt)
                        .map((c) => ({ id: c.id, name: c.name })),
                    )}
                  </Field>
                  <Field label="입력 방식">
                    {select("inputMode", [
                      { id: "quantity", name: "수량 우선" },
                      { id: "budget", name: "예산 우선" },
                    ])}
                  </Field>
                  <Field label="진행 회차당 예산 상한 · 선택">
                    {input("budget", "number")}
                  </Field>
                  <div className="full row">
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, cartMode: true })}
                    >
                      슬롯 장바구니
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, cartMode: false })}
                    >
                      기존 개별 상품 견적
                    </button>
                  </div>
                  {draft.cartMode && (
                    <SalesCartBuilder
                      prices={data.prices}
                      value={draft.packages || []}
                      blogId={draft.blogPriceId || ""}
                      clipId={draft.clipPriceId || ""}
                      onChange={(packages) => setDraft({ ...draft, packages })}
                      onPrice={(channel, id) =>
                        setDraft({
                          ...draft,
                          [channel === "blog" ? "blogPriceId" : "clipPriceId"]:
                            id,
                          packages: (draft.packages || []).map((p: Draft) => ({
                            ...p,
                            ...(channel === "blog" && p.type !== "clip"
                              ? { blogPriceId: id }
                              : {}),
                            ...(channel === "clip" && p.type !== "blog"
                              ? { clipPriceId: id }
                              : {}),
                          })),
                        })
                      }
                    />
                  )}
                  <div className="full" hidden={Boolean(draft.cartMode)}>
                    {(draft.lines || []).map((l: Draft, i: number) => (
                      <div className="row" style={{ marginTop: 10 }} key={i}>
                        <select
                          style={{ flex: 2 }}
                          aria-label={"상품 " + (i + 1)}
                          value={l.priceId}
                          onChange={(e) => {
                            const lines = [...draft.lines];
                            lines[i] = { ...l, priceId: e.target.value };
                            setDraft({ ...draft, lines });
                          }}
                        >
                          {data.prices.map((p) => (
                            <option key={p.id} value={p.id}>
                              {String(p.name)} · {money(p.sale)}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={"수량 " + (i + 1)}
                          style={{ flex: 1 }}
                          type="number"
                          min="1"
                          max="100"
                          value={l.quantity}
                          onChange={(e) => {
                            const lines = [...draft.lines];
                            lines[i] = {
                              ...l,
                              quantity: Number(e.target.value),
                            };
                            setDraft({ ...draft, lines });
                          }}
                        />
                        <button
                          type="button"
                          aria-label="항목 삭제"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              lines: draft.lines.filter(
                                (_: unknown, n: number) => n !== i,
                              ),
                            })
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      style={{ marginTop: 12 }}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          lines: [
                            ...draft.lines,
                            { priceId: data.prices[0]?.id || "", quantity: 1 },
                          ],
                        })
                      }
                    >
                      항목 추가
                    </button>
                    {draft.inputMode === "budget" && (
                      <div className="notice">
                        <p>
                          등록한 단가와 예산을 기준으로 적자 없는 수량 구성을
                          제안해요. 실제 성과를 보장하는 추천은 아닙니다.
                        </p>
                        {button("예산에 맞는 구성 추천", async () => {
                          setBusy(true);
                          try {
                            setRecommendations(
                              await api("/api/recommendations", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  budget: Number(draft.budget),
                                  discount: Number(draft.discount || 0),
                                }),
                              }),
                            );
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "실패");
                          } finally {
                            setBusy(false);
                          }
                        })}
                        {recommendations.map((r, i) => (
                          <div className="amountline" key={i}>
                            <span>
                              {r.name} · 블로그 {r.blogs} / 클립 {r.clips}
                              <small>
                                {" "}
                                판매액 {money(r.sale)} · 예상 마진{" "}
                                {money(r.margin)}
                              </small>
                            </span>
                            {button("적용", () =>
                              setDraft({ ...draft, lines: r.lines }),
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Field label="진행 회차당 할인액">
                    {input("discount", "number")}
                  </Field>
                  <Field label="시작 월">{input("startMonth", "month")}</Field>
                  <Field label="계약 기간 · 개월">
                    {input("months", "number")}
                  </Field>
                  <Field label="월 진행 횟수 · 장바구니 구성 반복">
                    {input("setsPerMonth", "number")}
                  </Field>
                  <Field label="세금 입력 기준">
                    {select("taxChoice", [
                      { id: "exclusive", name: "VAT 별도" },
                      { id: "inclusive", name: "VAT 포함" },
                    ])}
                  </Field>
                  <div className="full notice">
                    <div className="amountline">
                      <span>판매 공급가액</span>
                      <strong>{money(previewNet)}</strong>
                    </div>
                    <div className="amountline">
                      <span>예상 지급액 + AI 제작비</span>
                      <strong>{money(previewCost)}</strong>
                    </div>
                    <div className="amountline">
                      <span>예상 직접비 차감 마진</span>
                      <strong>
                        {previewCost === null
                          ? "미정"
                          : money(previewNet - previewCost)}{" "}
                        {previewCost !== null && previewNet > 0
                          ? `(${(((previewNet - previewCost) / previewNet) * 100).toFixed(1)}%)`
                          : ""}
                      </strong>
                    </div>
                    진행 회차당 판매액{" "}
                    {money(
                      (draft.cartMode
                        ? cartPreview?.total || 0
                        : (draft.lines || []).reduce(
                            (s: number, l: Draft) =>
                              s +
                              Number(find("prices", l.priceId)?.sale || 0) *
                                l.quantity,
                            0,
                          )) - Number(draft.discount || 0),
                    )}{" "}
                    · 확정 후 단가를 고정합니다.
                  </div>
                </>
              )}
              {modal === "projects" && (
                <>
                  <Field label="프로젝트명">{input("name")}</Field>
                  <Field label="계약">
                    {select(
                      "contractId",
                      data.contracts.map((c) => ({ id: c.id, name: c.name })),
                    )}
                  </Field>
                  <Field label="제품">
                    {select(
                      "productId",
                      data.products
                        .filter(
                          (p) =>
                            !p.deletedAt &&
                            p.customerId ===
                              find("contracts", draft.contractId)?.customerId &&
                            !find("customers", p.customerId)?.deletedAt,
                        )
                        .map((p) => ({ id: p.id, name: p.name })),
                    )}
                  </Field>
                  <Field label="계약 진행 회차">
                    {
                      <select
                        aria-label="계약 진행 회차"
                        value={draft.slot}
                        onChange={(e) =>
                          setDraft({ ...draft, slot: Number(e.target.value) })
                        }
                      >
                        {Array.from(
                          {
                            length: Number(
                              find("contracts", draft.contractId)?.slotCount ||
                                0,
                            ),
                          },
                          (_, i) => (
                            <option
                              key={i}
                              value={i}
                              disabled={data.projects.some(
                                (p) =>
                                  p.contractId === draft.contractId &&
                                  p.slot === i,
                              )}
                            >
                              {Math.floor(
                                i /
                                  Number(
                                    find("contracts", draft.contractId)
                                      ?.setsPerMonth || 1,
                                  ),
                              ) + 1}
                              개월차 ·{" "}
                              {(i %
                                Number(
                                  find("contracts", draft.contractId)
                                    ?.setsPerMonth || 1,
                                )) +
                                1}
                              번째
                            </option>
                          ),
                        )}
                      </select>
                    }
                  </Field>
                  <Field label="납기">{input("due", "date")}</Field>
                  <Field label="AI 제작비 상한">
                    {input("budget", "number")}
                  </Field>
                  <Field label="이번 작업 요청" full>
                    {area("instructions")}
                  </Field>
                  <Field label="촬영 대상 (선택)">
                    <select
                      value={draft.shootingTarget || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, shootingTarget: e.target.value })
                      }
                    >
                      <option value="">자동 · 자료에 맞춰 판단</option>
                      {shootingTargetOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="이미지·영상 추가 요청 (선택)" full>
                    {area(
                      "mediaInstructions",
                      "예: 밝은 낮 시간대, 자연스러운 색감. 실제 구조를 유지하고 인파를 과장하지 마세요.",
                    )}
                    <p className="hint">
                      비워두면 자료에 맞춰 자동 기획합니다. 변경 사항은 다음
                      기획·생성 요청부터 반영됩니다.
                    </p>
                  </Field>
                  <Field label="희망 키워드 (선택 · 쉼표로 구분)" full>
                    {input("preferredKeywords")}
                    <p className="hint">
                      예: 피자설기, 떡 간식. 비워두면 조사 단계에서 관련
                      키워드를 추천합니다.
                    </p>
                  </Field>
                </>
              )}
              {modal === "task" && (
                <>
                  <Field label="기획안" full>
                    {area("brief")}
                  </Field>
                  <Field label="등록된 체험단">
                    <select
                      value={draft.participantId || ""}
                      disabled={
                        draft.payoutStatus === "paid" ||
                        Boolean(draft.postingSetId || draft.workSlotId)
                      }
                      onChange={(e) => {
                        const p = find("participants", e.target.value);
                        const account = ((p?.accounts as Draft[]) || []).find(
                          (a) => accountAssignable(a, draft.channel),
                        );
                        setDraft({
                          ...draft,
                          participantId: e.target.value,
                          participantAccountId: account?.id || "",
                          assignee: p ? String(p.nickname || p.name) : "",
                        });
                      }}
                    >
                      <option value="">미배정 / 기존 담당자명 사용</option>
                      {data.participants
                        .filter(
                          (p) =>
                            p.status === "active" ||
                            p.id === draft.participantId,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {String(p.nickname || p.name)}
                            {p.status !== "active" ? " · 섭외 중지" : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {draft.participantId ? (
                    <Field label="게시 계정">
                      <select
                        value={draft.participantAccountId || ""}
                        disabled={
                          draft.payoutStatus === "paid" ||
                          Boolean(draft.postingSetId || draft.workSlotId)
                        }
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            participantAccountId: e.target.value,
                          })
                        }
                      >
                        <option value="">계정 선택</option>
                        {(
                          (find("participants", draft.participantId)
                            ?.accounts || []) as Draft[]
                        )
                          .filter(
                            (a) =>
                              accountAssignable(a, draft.channel) ||
                              a.id === draft.participantAccountId,
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label || a.url}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ) : (
                    <Field label="기존 담당자명">{input("assignee")}</Field>
                  )}
                  <Field label="지급액">
                    {draft.postingSetId || draft.workSlotId ? (
                      <p>
                        슬롯 또는 세트 보수에 포함 · 슬롯·배정 / 전달·게시에서
                        관리
                      </p>
                    ) : (
                      input("payout", "number")
                    )}
                  </Field>
                  {draft.participantId && (
                    <div className="full">
                      <button
                        type="button"
                        disabled={
                          draft.payoutStatus === "paid" ||
                          Boolean(draft.postingSetId || draft.workSlotId)
                        }
                        onClick={() => {
                          const p = find("participants", draft.participantId);
                          const rate =
                            draft.channel === "blog"
                              ? p?.blogRate
                              : p?.clipRate;
                          if (rate === null || rate === undefined) {
                            setError("체험단 기본 지급액이 미정입니다.");
                            return;
                          }
                          setDraft({ ...draft, payout: rate });
                        }}
                      >
                        체험단 기본 지급액 적용
                      </button>
                      <p className="hint">
                        현재 작업 금액만 변경합니다. 단가를 바꿔도 다른 작업의
                        지급액은 유지됩니다.
                      </p>
                    </div>
                  )}
                </>
              )}
              {modal === "notes" && (
                <>
                  <Field label="확인한 고객 자료 메모" full>
                    {area("materialNotes")}
                  </Field>
                  <Field label="이번 프로젝트 요청" full>
                    {area("instructions")}
                  </Field>
                  <Field label="촬영 대상 (선택)">
                    <select
                      value={draft.shootingTarget || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, shootingTarget: e.target.value })
                      }
                    >
                      <option value="">자동 · 자료에 맞춰 판단</option>
                      {shootingTargetOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="이미지·영상 추가 요청 (선택)" full>
                    {area(
                      "mediaInstructions",
                      "예: 밝은 낮 시간대, 자연스러운 색감. 실제 구조를 유지하고 인파를 과장하지 마세요.",
                    )}
                    <p className="hint">
                      비워두면 자료에 맞춰 자동 기획합니다. 변경 사항은 다음
                      기획·생성 요청부터 반영됩니다.
                    </p>
                  </Field>
                  <Field label="희망 키워드 (선택 · 쉼표로 구분)" full>
                    {input("preferredKeywords")}
                    <p className="hint">
                      다음 조사·기획 요청에 반영됩니다. 이미 승인한 기획·원고는
                      자동 변경하지 않습니다.
                    </p>
                  </Field>
                  <Field label="AI 제작비 상한">
                    {input("budget", "number")}
                  </Field>
                </>
              )}
              {modal === "confirmCost" && (
                <>
                  <Field label="실제 청구 비용 · 원">
                    {input("amount", "number")}
                  </Field>
                  <Field label="확인 내역" full>
                    {input("description")}
                  </Field>
                </>
              )}
              {modal === "jobResolution" && (
                <>
                  <div className="notice full">
                    공급사 실행·청구 내역을 확인한 뒤 기록하세요. 기존 비용은
                    유지됩니다. 새 생성은 별도 비용이 발생할 수 있어요.
                  </div>
                  <Field label="확인 결과" full>
                    {area("note")}
                  </Field>
                </>
              )}
              {modal === "cost" && (
                <>
                  <Field label="비용 구분">
                    {select("category", [
                      { id: "ai", name: "AI 비용" },
                      { id: "shipping", name: "배송" },
                      { id: "shooting", name: "촬영" },
                      { id: "editing", name: "편집" },
                      { id: "other", name: "기타" },
                    ])}
                  </Field>
                  <Field label="금액 · 원">{input("amount", "number")}</Field>
                  <Field label="내역" full>
                    {input("description")}
                  </Field>
                  <Field label="확정 비용">
                    <input
                      type="checkbox"
                      checked={draft.confirmed}
                      onChange={(e) =>
                        setDraft({ ...draft, confirmed: e.target.checked })
                      }
                    />
                  </Field>
                </>
              )}
              {modal === "publication" && (
                <>
                  <Field label="게시 품질 평가 (선택)">
                    <select
                      value={draft.qualityScore ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          qualityScore: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">미평가</option>
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n}점 ·{" "}
                          {n === 5
                            ? "요청대로 정확"
                            : n === 1
                              ? "누락·오류 많음"
                              : "운영자 평가"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="검수 메모">{area("qualityNotes")}</Field>
                  <Field label="게시 링크" full>
                    {input("link", "url")}
                  </Field>
                  <Field label="직접 확인 완료">
                    <input
                      type="checkbox"
                      checked={draft.verified}
                      onChange={(e) =>
                        setDraft({ ...draft, verified: e.target.checked })
                      }
                    />
                  </Field>
                </>
              )}
              {modal === "feedback" && (
                <Field label="어떤 부분을 수정할까요?" full>
                  {area("feedback")}
                </Field>
              )}
              {modal === "content" && (
                <Field
                  label={
                    find("tasks", draft.taskId)?.channel === "clip"
                      ? "클립 설명"
                      : "원고"
                  }
                  full
                >
                  {area("text")}
                  {find("tasks", draft.taskId)?.channel === "clip" && (
                    <p className="hint" role="status">
                      {clipDescription(String(draft.text || "")).length}/300자 ·
                      해시태그{" "}
                      {
                        clipDescription(String(draft.text || "")).hashtags
                          .length
                      }
                      /5개 ·{" "}
                      {clipDescription(String(draft.text || "")).errors.join(
                        " ",
                      ) || "설명 기준 충족"}
                    </p>
                  )}
                </Field>
              )}
              {modal === "delivery" && (
                <>
                  <Field label="전달 채널">{input("channel")}</Field>
                  <Field label="메모">{input("note")}</Field>
                  <div className="full">
                    {tasks
                      .filter((t) => t.status === "approved")
                      .map((t) => (
                        <label key={t.id}>
                          <input
                            type="checkbox"
                            style={{ width: "auto", marginRight: 10 }}
                            checked={draft.taskIds.includes(t.id)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                taskIds: e.target.checked
                                  ? [...draft.taskIds, t.id]
                                  : draft.taskIds.filter(
                                      (id: string) => id !== t.id,
                                    ),
                              })
                            }
                          />
                          {String(t.name)}
                        </label>
                      ))}
                  </div>
                </>
              )}
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <footer>
              <button
                type="button"
                onClick={() => setModal("")}
                disabled={busy}
              >
                취소
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "저장 중…"
                  : modal === "contracts"
                    ? "견적·계약 확정"
                    : "저장"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}
