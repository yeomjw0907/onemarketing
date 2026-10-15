"use client";
import { useState } from "react";
import { formatMobilePhone } from "@/lib/participant-payment";
import ParticipantPaymentFields from "./participant-payment-fields";
import {
  applicationChannels,
  type ApplicationDraft,
} from "@/lib/participant-application-schema";
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
  const domains = [
    "naver.com",
    "gmail.com",
    "daum.net",
    "hanmail.net",
    "nate.com",
    "icloud.com",
    "outlook.com",
  ];
  const at = draft.email.indexOf("@");
  const emailId = at < 0 ? draft.email : draft.email.slice(0, at);
  const emailDomain = at < 0 ? "" : draft.email.slice(at + 1);
  const [customDomain, setCustomDomain] = useState(
    !!emailDomain && !domains.includes(emailDomain),
  );
  const setEmail = (id: string, domain: string) =>
    onChange({ ...draft, email: id || domain ? id + "@" + domain : "" });
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
              gap: 10,
              alignItems: "end",
            }}
          >
            <label>
              이메일 아이디
              <input
                aria-label="이메일 아이디"
                autoComplete="off"
                maxLength={64}
                pattern={"[^@\\s]+"}
                placeholder="test"
                required={!!emailDomain}
                value={emailId}
                onChange={(e) => setEmail(e.target.value, emailDomain)}
              />
            </label>
            <span style={{ paddingBottom: 12 }} aria-hidden="true">
              @
            </span>
            <label>
              이메일 도메인
              <select
                value={customDomain ? "custom" : emailDomain}
                required={!!emailId}
                onChange={(e) => {
                  const custom = e.target.value === "custom";
                  setCustomDomain(custom);
                  setEmail(emailId, custom ? "" : e.target.value);
                }}
              >
                <option value="">도메인 선택</option>
                {domains.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
                <option value="custom">직접 입력</option>
              </select>
            </label>
          </div>
          {customDomain && (
            <label style={{ marginTop: 12 }}>
              이메일 도메인 직접 입력
              <input
                required={!!emailId}
                autoComplete="off"
                maxLength={189}
                placeholder="example.com"
                value={emailDomain}
                onChange={(e) => setEmail(emailId, e.target.value)}
              />
            </label>
          )}
        </div>
        {field("region", "활동 지역 · 시/구까지")}
      </div>
      <h3 style={{ marginTop: 28 }}>활동 계정 *</h3>
      <p className="hint">
        블로그·클립 등 본인이 운영하는 계정 주소를 입력해주세요.
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
          <label style={{ flex: "1 1 140px" }}>
            채널 {i + 1}
            <select
              value={a.channel}
              onChange={(e) =>
                onChange({
                  ...draft,
                  accounts: draft.accounts.map((v, j) =>
                    j === i
                      ? { ...v, channel: e.target.value as typeof a.channel }
                      : v,
                  ),
                })
              }
            >
              {Object.entries(applicationChannels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
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
                  channel: "clip",
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
