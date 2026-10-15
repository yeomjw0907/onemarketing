"use client";
import ApplicationEmail from "./application-email";
import ApplicationChannelSelect from "./application-channel-select";
import { formatMobilePhone } from "@/lib/participant-payment";
import ParticipantPaymentFields from "./participant-payment-fields";
import type { ApplicationDraft } from "@/lib/participant-application-schema";
export function freshApplication(): ApplicationDraft {
  return {
    name: "",
    nickname: "",
    phone: "",
    email: "",
    region: "",
    specialties: "",
    introduction: "",
    payment: { method: "kakaopay" },
    accounts: [
      { id: crypto.randomUUID(), channel: "blog", url: "", label: "" },
    ],
  };
}
export default function ApplicationFields({
  draft,
  onChange,
  disabled = false,
}: {
  draft: ApplicationDraft;
  onChange: (draft: ApplicationDraft) => void;
  disabled?: boolean;
}) {
  const field = (
    key: "name" | "region",
    label: string,
    type = "text",
    required = false,
    maxLength = 200,
  ) => (
    <label>
      {label}
      {required && " *"}
      <input
        type={type}
        required={required}
        maxLength={maxLength}
        placeholder={key === "region" ? "서울시 강남구" : undefined}
        value={draft[key]}
        onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <fieldset
      disabled={disabled}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <div className="fields">
        {field("name", "이름", "text", true)}
        <label>
          휴대전화 *
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            maxLength={13}
            placeholder="010-0000-0000"
            value={draft.phone}
            onChange={(e) =>
              onChange({ ...draft, phone: formatMobilePhone(e.target.value) })
            }
          />
        </label>
        <div className="full">
          <ApplicationEmail
            value={draft.email}
            onChange={(email) => onChange({ ...draft, email })}
          />
        </div>
        {field("region", "활동 지역 · 시/구까지")}
      </div>
      <h3 style={{ marginTop: 28 }}>활동 계정 *</h3>
      <p className="hint">
        본인이 운영하는 블로그·SNS 계정 주소를 입력해주세요. 클립 참여 시에도
        네이버 블로그 계정을 입력해주세요.
      </p>
      {draft.accounts.map((a, i) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "end",
            marginBottom: 14,
          }}
        >
          <ApplicationChannelSelect
            label={"채널 " + (i + 1)}
            value={a.channel}
            onChange={(channel) =>
              onChange({
                ...draft,
                accounts: draft.accounts.map((v, j) =>
                  j === i ? { ...v, channel } : v,
                ),
              })
            }
          />
          <label style={{ flex: "3 1 220px" }}>
            계정 주소 {i + 1}
            <input
              type="url"
              required
              maxLength={2048}
              placeholder="https://blog.naver.com/..."
              value={a.url}
              onChange={(e) =>
                onChange({
                  ...draft,
                  accounts: draft.accounts.map((v, j) =>
                    j === i ? { ...v, url: e.target.value } : v,
                  ),
                })
              }
            />
          </label>
          {draft.accounts.length > 1 && (
            <button
              type="button"
              aria-label={`계정 ${i + 1} 삭제`}
              onClick={() =>
                onChange({
                  ...draft,
                  accounts: draft.accounts.filter((_, j) => j !== i),
                })
              }
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {draft.accounts.length < 10 && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              accounts: [
                ...draft.accounts,
                {
                  id: crypto.randomUUID(),
                  channel: "blog",
                  url: "",
                  label: "",
                },
              ],
            })
          }
        >
          + 활동 계정 추가
        </button>
      )}
      <ParticipantPaymentFields
        payment={draft.payment}
        onChange={(payment) => onChange({ ...draft, payment })}
      />
    </fieldset>
  );
}
