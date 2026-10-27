"use client";
import { useEffect, useRef, useState } from "react";
import { Package, Plus, Paperclip, ArrowLeft } from "lucide-react";
import { requestJSON } from "@/lib/request-json";
import { marketFetch } from "./public-fetch";
import QuestionFlow, { type Question } from "./question-flow";
import s from "./advertiser-products.module.css";
type Product = {
  id: string;
  version: number;
  name: string;
  facts: string;
  claims: string;
  forbidden: string;
  preserve: string;
  links: string[];
  files: { id: string; name: string; size: number; mime: string }[];
};
const questions: Question[] = [
  { key: "name", title: "제품·서비스 이름을 알려주세요.", required: true },
  {
    key: "facts",
    title: "어떤 제품·서비스인가요?",
    hint: "특징·규격·성분·사용법 등 확인된 정보를 적어주세요.",
    type: "textarea",
  },
  {
    key: "claims",
    title: "꼭 강조하고 싶은 내용은요?",
    hint: "근거 자료가 있다면 제품 저장 후 함께 첨부해주세요.",
    type: "textarea",
  },
  { key: "forbidden", title: "피해야 할 표현이 있나요?", type: "textarea" },
  {
    key: "preserve",
    title: "반드시 유지해야 하는 표현은요?",
    type: "textarea",
  },
  {
    key: "links",
    title: "제품을 확인할 링크가 있나요?",
    hint: "한 줄에 하나씩, 최대 5개까지 입력해주세요.",
    type: "textarea",
  },
];
export default function AdvertiserProducts({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const [products, setProducts] = useState<Product[]>([]),
    [edit, setEdit] = useState<Product | null | "new">(null),
    [values, setValues] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [errorStatus, setErrorStatus] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  async function load() {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setErrorStatus(0);
    try {
      const data = await marketFetch("/api/advertiser-products");
      if (request === generation.current) {
        setProducts(data);
        setLoaded(true);
      }
    } catch (e) {
      if (request === generation.current) {
        setError((e as Error).message);
        setErrorStatus(Number((e as { status?: number }).status || 0));
      }
      throw e;
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load().catch(() => {});
    return () => {
      generation.current++;
    };
  }, [refreshKey]);
  function open(p: Product | "new") {
    setError("");
    setNotice("");
    setEdit(p);
    setValues(
      p === "new"
        ? {}
        : {
            name: p.name,
            facts: p.facts,
            claims: p.claims,
            forbidden: p.forbidden,
            preserve: p.preserve,
            links: p.links.join("\n"),
          },
    );
  }
  async function upload(p: Product, file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setError(
        "파일당 4MB 이하로 등록해주세요. 큰 영상은 공유 링크로 남겨주세요.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("productId", p.id);
      form.set("file", file);
      await requestJSON(
        "/api/advertiser-products",
        { method: "POST", body: form },
        { timeoutMs: 60_000 },
      );
      setNotice("자료를 추가했어요. 담당자도 같은 자료를 확인할 수 있어요.");
      await load().catch(() =>
        setNotice(
          "자료 등록은 완료됐지만 목록을 갱신하지 못했어요. 다시 불러와주세요.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.root} aria-label="내 제품·서비스">
      {notice && (
        <p role="status" className={s.notice}>
          {notice}
        </p>
      )}
      {error && !edit && (
        <div role="alert" className={s.error}>
          <p>{error}</p>
          {errorStatus === 401 ? (
            <a href="/login?role=advertiser">로그인으로 이동</a>
          ) : (
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void load().catch(() => {})}
            >
              다시 불러오기
            </button>
          )}
        </div>
      )}
      {edit ? (
        <>
          <button
            type="button"
            className={s.back}
            disabled={busy}
            onClick={() => setEdit(null)}
          >
            <ArrowLeft size={18} /> 제품 목록
          </button>
          <QuestionFlow
            key={edit === "new" ? "new" : edit.id}
            title={edit === "new" ? "새 제품 등록" : "제품 정보 수정"}
            questions={questions}
            values={values}
            onChange={(key, value) =>
              setValues((v) => ({ ...v, [key]: value }))
            }
            busy={busy}
            error={error}
            completeLabel="제품 정보 저장"
            onComplete={async () => {
              setBusy(true);
              setError("");
              try {
                await marketFetch("/api/advertiser-products", {
                  ...values,
                  ...(edit !== "new"
                    ? { id: edit.id, version: edit.version }
                    : {}),
                  links: (values.links || "")
                    .split("\n")
                    .map((v) => v.trim())
                    .filter(Boolean),
                });
                setEdit(null);
                setNotice(
                  "제품 정보를 저장했어요. 기존 캠페인의 확정 정보는 유지돼요.",
                );
                await load().catch(() =>
                  setNotice(
                    "제품 저장은 완료됐지만 목록을 갱신하지 못했어요. 다시 불러와 결과를 확인해주세요.",
                  ),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : (
        <>
          <div className={s.heading}>
            <div>
              <h2>내 제품·서비스</h2>
              <p>제품 정보와 자료를 담당자와 함께 관리해요.</p>
            </div>
            <button
              type="button"
              disabled={busy || loading || !loaded}
              onClick={() => open("new")}
            >
              <Plus size={18} /> 제품 등록
            </button>
          </div>
          {loading ? (
            <p role="status">제품을 불러오고 있어요…</p>
          ) : !loaded ? null : !products.length ? (
            <div className={s.empty}>
              <Package size={36} />
              <h3>아직 등록된 제품이 없어요.</h3>
              <p>첫 제품을 등록하면 다음 캠페인에서도 사용할 수 있어요.</p>
            </div>
          ) : (
            products.map((p) => (
              <article className={s.product} key={p.id}>
                <div className={s.heading}>
                  <h3>{p.name}</h3>
                  <button type="button" disabled={busy} onClick={() => open(p)}>
                    정보 수정
                  </button>
                </div>
                <dl>
                  {[
                    ["제품 소개", p.facts],
                    ["강조할 내용", p.claims],
                    ["주의할 표현", p.forbidden],
                    ["유지할 표현", p.preserve],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || "아직 입력하지 않았어요."}</dd>
                    </div>
                  ))}
                </dl>
                {p.links.map((link) => (
                  <p key={link}>
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      {link}
                    </a>
                  </p>
                ))}
                <div className={s.files}>
                  <h4>
                    <Paperclip size={17} /> 제품 자료 · {p.files.length}개
                  </h4>
                  {p.files.map((f) => (
                    <a
                      key={f.id}
                      href={"/api/advertiser-products?file=" + f.id}
                    >
                      {f.name} <small>{Math.ceil(f.size / 1024)}KB</small>
                    </a>
                  ))}
                  <label>
                    자료 추가
                    <input
                      type="file"
                      disabled={busy}
                      accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.csv,.txt,.md"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(p, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p>
                    사진·PDF·소개서 등 파일당 4MB까지 등록할 수 있어요. 큰
                    영상은 제품 정보에 공유 링크로 남겨주세요.
                  </p>
                </div>
              </article>
            ))
          )}
        </>
      )}
    </section>
  );
}
