"use client";
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
    key: "name" | "nickname" | "phone" | "email" | "region" | "specialties",
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
        {field("nickname", "닉네임", "text", false, 100)}
        {field("phone", "휴대전화", "tel", true, 40)}
        {field("email", "이메일", "email", false, 254)}
        {field("region", "활동 지역 · 시/구까지")}
        {field("specialties", "관심 분야", "text", false, 1000)}
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
      <label style={{ marginTop: 24 }}>
        간단한 소개 · 활동 경험
        <textarea
          maxLength={3000}
          value={draft.introduction}
          onChange={(e) => onChange({ ...draft, introduction: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
