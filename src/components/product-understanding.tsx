"use client";
import { useState } from "react";
import { Button, Field, Feedback } from "./ui/workflow-ui";
import {
  productFields,
  missingProductFields,
  type ProductProfile,
  type ProductUnderstanding,
} from "@/lib/product-understanding-schema";
import type { RecordData } from "@/lib/types";

export default function ProductUnderstandingReview({
  project,
  busy,
  onAction,
  onGenerate,
}: {
  project: RecordData;
  busy: boolean;
  onAction: (name: string, extra: Record<string, unknown>) => Promise<unknown>;
  onGenerate: () => void;
}) {
  const draft = project.productUnderstanding as
    ProductUnderstanding | undefined;
  const [links, setLinks] = useState(
    ((project.productLinks || []) as string[]).join("\n"),
  );
  const [profile, setProfile] = useState<ProductProfile>(
    draft?.profile || {
      name: "",
      category: "",
      features: "",
      target: "",
      salesScope: "",
      goal: "",
      forbidden: "",
    },
  );
  const [checked, setChecked] = useState(false);
  const current = project.productUnderstandingCurrent === true;
  const editable =
    ["materials", "planning", "brief_review"].includes(
      String(project.status),
    ) &&
    !project.hold &&
    !project.settled;
  const missing = missingProductFields(profile);
  return (
    <section className="section product-understanding">
      <div className="section-title">
        <h2>제품 이해 확인</h2>
        <span className="badge">
          {current ? "확정 완료" : draft ? "내부 확인 필요" : "자료 정리 전"}
        </span>
      </div>
      <p className="hint">
        엑셀·회사소개서·제품소개서와 제품 링크를 먼저 정리해요. 확인한 제품
        정보로 키워드를 분석하고, 고객에게는 별도로 확정한 키워드만 공유해요.
      </p>
      <Field help="한 줄에 하나씩, 최대 5개. 로그인이나 접근 제한이 있는 페이지는 소개 자료를 함께 등록해주세요.">
        <span>제품 상세페이지·공식 링크</span>
        <textarea
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          disabled={!editable}
        />
      </Field>
      <div className="row">
        <Button
          disabled={busy || !editable}
          onClick={() =>
            void onAction("product-links", {
              links: links
                .split(/\n/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        >
          제품 링크 저장
        </Button>
        <Button
          variant="primary"
          disabled={
            busy ||
            !editable ||
            links.trim() !==
              ((project.productLinks || []) as string[]).join("\n").trim()
          }
          onClick={onGenerate}
        >
          {draft ? "자료 다시 정리" : "자료에서 제품 정보 정리"}
        </Button>
      </div>
      <p className="hint">
        PDF·엑셀·CSV·사진·텍스트를 지원해요. PPT·한글·워드 소개서는 PDF로
        저장해서 등록해주세요. PDF는 합계 80쪽·12MB 이하로 필요한 부분을
        준비해주세요. AI 자료 정리 비용은 프로젝트 예산에서 관리해요.
      </p>
      {draft && (
        <>
          {!current && draft.approvedAt && (
            <Feedback>
              자료 또는 제품 정보가 변경됐어요. 자료를 다시 정리한 뒤
              확인해주세요.
            </Feedback>
          )}
          {draft.notes && <p className="notice">{draft.notes}</p>}
          {!!draft.questions.length && (
            <div className="notice">
              <strong>이 내용만 추가로 확인해주세요</strong>
              <ul>
                {draft.questions.map((q, i) => (
                  <li key={i}>{q.question}</li>
                ))}
              </ul>
              <p>아래 해당 항목을 채우거나 수정해주세요.</p>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onAction("product-understanding-confirm", { profile });
            }}
          >
            <div className="product-profile-grid">
              {(Object.keys(productFields) as (keyof ProductProfile)[]).map(
                (k) => (
                  <Field
                    key={k}
                    help={
                      k === "target"
                        ? "모르면 비워두세요. 특정 타깃으로 단정하지 않아요."
                        : undefined
                    }
                  >
                    <span>
                      {productFields[k]}
                      {["target", "forbidden"].includes(k) ? " (선택)" : ""}
                    </span>
                    {["features", "forbidden"].includes(k) ? (
                      <textarea
                        required={k === "features"}
                        maxLength={5000}
                        value={profile[k]}
                        disabled={!editable}
                        onChange={(e) => {
                          setProfile({ ...profile, [k]: e.target.value });
                          setChecked(false);
                        }}
                      />
                    ) : (
                      <input
                        required={k !== "target"}
                        maxLength={5000}
                        value={profile[k]}
                        disabled={!editable}
                        onChange={(e) => {
                          setProfile({ ...profile, [k]: e.target.value });
                          setChecked(false);
                        }}
                      />
                    )}
                  </Field>
                ),
              )}
            </div>
            {!!draft.evidence.length && (
              <details>
                <summary>자료별 근거 확인</summary>
                {draft.evidence.map((e, i) => (
                  <p key={i}>
                    <strong>
                      {productFields[e.field]} · {e.source}
                    </strong>
                    <br />
                    {e.detail}
                  </p>
                ))}
              </details>
            )}
            <Field>
              <input
                type="checkbox"
                checked={checked}
                required
                disabled={!editable}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>
                대상 제품과 자료의 충돌·확인 질문을 검토했고, 위 내용을 분석
                기준으로 확정합니다.
              </span>
            </Field>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !editable || !checked || missing.length > 0}
            >
              제품 정보 확정
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

export function KeywordConfirmation({
  project,
  busy,
  onConfirm,
}: {
  project: RecordData;
  busy: boolean;
  onConfirm: (data: Record<string, unknown>) => Promise<unknown>;
}) {
  const plan = project.recommendedKeywords as
    | {
        main: string[];
        secondary: string[];
        reason: string;
        candidates?: { keyword: string }[];
      }
    | undefined;
  const [main, setMain] = useState(plan?.main.join(", ") || "");
  const [secondary, setSecondary] = useState(plan?.secondary.join(", ") || "");
  const [reason, setReason] = useState(plan?.reason || "");
  if (!plan) return null;
  const split = (s: string) =>
    s
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  return (
    <form
      className="keyword-confirmation"
      onSubmit={(e) => {
        e.preventDefault();
        void onConfirm({
          main: split(main),
          secondary: split(secondary),
          reason,
        });
      }}
    >
      <h3>고객 공유 내용 확정</h3>
      <p className="hint">
        검토 중인 분석과 원본 자료는 고객에게 공개하지 않아요. 분석 후보 중
        공유할 키워드를 선택하고 선정 이유를 확인해주세요.
      </p>
      <Field>
        <span>핵심 키워드</span>
        <input
          required
          value={main}
          onChange={(e) => setMain(e.target.value)}
        />
      </Field>
      <Field>
        <span>보조 키워드</span>
        <input
          value={secondary}
          onChange={(e) => setSecondary(e.target.value)}
        />
      </Field>
      <Field>
        <span>고객에게 설명할 선정 이유</span>
        <textarea
          required
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        variant="primary"
        disabled={
          busy ||
          !project.productUnderstandingCurrent ||
          !plan.candidates?.length
        }
      >
        이 내용으로 고객 공유 확정
      </Button>
      <p className="hint">
        {project.confirmedKeywordAnalysis
          ? "확정한 내용이 고객 보고 페이지와 보고 엑셀에 표시돼요."
          : "아직 고객에게 공유하지 않았어요."}
      </p>
    </form>
  );
}
