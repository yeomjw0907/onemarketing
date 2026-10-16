"use client";
import ApplicationEmail from "./application-email";
import ApplicationInput from "./application-input";
import ApplicationChannelSelect from "./application-channel-select";
import { formatMobilePhone } from "@/lib/participant-payment";
import {
  accountInputs,
  accountInputValue,
  normalizeApplicationAccount,
} from "@/lib/application-accounts";
import ParticipantPaymentFields from "./participant-payment-fields";
import type { ApplicationDraft } from "@/lib/participant-application-schema";
import styles from "./application-inputs.module.css";
import { Check } from "lucide-react";
export function freshApplication(): ApplicationDraft {
  return {
    name: "",
    operationType: "self",
    teamName: "",
    authorityConsent: false,
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
  return (
    <fieldset
      disabled={disabled}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <h3>추천 및 모집 알림</h3>
      <ApplicationInput
        label="추천 코드 (선택)"
        value={draft.referralCode || ""}
        maxLength={40}
        onChange={(referralCode) => onChange({ ...draft, referralCode })}
      />
      <label>
        <input
          type="checkbox"
          checked={draft.kakaoMarketingConsent === true}
          onChange={(e) =>
            onChange({ ...draft, kakaoMarketingConsent: e.target.checked })
          }
        />
        카카오톡 신규 캠페인 모집 광고 수신 동의 (선택)
      </label>
      <p>
        동의하지 않아도 가입할 수 있으며 참여자 화면에서 언제든 철회할 수
        있습니다.
      </p>
      <h3>계정 운영 형태</h3>
      <div
        className={styles.paymentOptions}
        role="group"
        aria-label="계정 운영 형태"
      >
        {(
          [
            ["self", "본인 계정"],
            ["managed", "여러 계정 운영"],
          ] as const
        ).map(([type, label]) => (
          <button
            key={type}
            type="button"
            aria-pressed={(draft.operationType || "self") === type}
            onClick={() => onChange({ ...draft, operationType: type })}
          >
            {(draft.operationType || "self") === type && <Check size={18} />}
            {label}
          </button>
        ))}
      </div>
      {draft.operationType === "managed" && (
        <p className={styles.fieldHelp} style={{ marginBottom: 20 }}>
          담당자 한 분이 여러 계정을 등록할 수 있어요. 계정별로 검토·배정하고,
          보수는 담당자에게 합산 정산합니다.
        </p>
      )}
      <div className={styles.fieldGrid}>
        <ApplicationInput
          label={draft.operationType === "managed" ? "담당자 이름" : "이름"}
          required
          autoComplete="name"
          maxLength={200}
          placeholder="이름을 입력해주세요"
          value={draft.name}
          onChange={(name) => onChange({ ...draft, name })}
        />
        {draft.operationType === "managed" && (
          <ApplicationInput
            label="업체명 · 운영팀명 (선택)"
            value={draft.teamName || ""}
            onChange={(teamName) => onChange({ ...draft, teamName })}
            maxLength={200}
            placeholder="예: 원케이션 운영팀"
          />
        )}
        <ApplicationInput
          label="휴대전화"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          maxLength={13}
          placeholder="010-0000-0000"
          value={draft.phone}
          onChange={(phone) =>
            onChange({ ...draft, phone: formatMobilePhone(phone) })
          }
          validate={(phone) =>
            phone.replace(/[^0-9]/g, "").length < 10
              ? "연락 가능한 휴대전화 번호를 입력해주세요."
              : ""
          }
        />
        <ApplicationEmail
          value={draft.email}
          onChange={(email) => onChange({ ...draft, email })}
        />
        <ApplicationInput
          label="활동 지역 · 시/구까지"
          maxLength={200}
          placeholder="서울시 강남구"
          value={draft.region}
          onChange={(region) => onChange({ ...draft, region })}
        />
      </div>
      <section className={styles.section} aria-label="활동 계정">
        <h3>활동 계정</h3>
        {draft.accounts.map((account, index) => {
          const config = accountInputs[account.channel] || accountInputs.other;
          return (
            <div key={account.id} className={styles.account}>
              {draft.operationType === "managed" && (
                <ApplicationInput
                  label="관리용 별칭"
                  aria-label={`관리용 별칭 ${index + 1}`}
                  required
                  maxLength={100}
                  placeholder="예: 뷰티 블로그 A"
                  value={account.label}
                  data-field={`accounts.${index}.label`}
                  onChange={(label) =>
                    onChange({
                      ...draft,
                      accounts: draft.accounts.map((a, i) =>
                        i === index ? { ...a, label } : a,
                      ),
                    })
                  }
                />
              )}
              <div className={styles.accountHeader}>
                <ApplicationChannelSelect
                  label={
                    draft.accounts.length > 1
                      ? `활동 채널 ${index + 1}`
                      : "활동 채널"
                  }
                  value={account.channel}
                  onChange={(channel) =>
                    onChange({
                      ...draft,
                      accounts: draft.accounts.map((a, i) =>
                        i === index ? { ...a, channel, url: "" } : a,
                      ),
                    })
                  }
                />
                {draft.accounts.length > 1 && (
                  <button
                    type="button"
                    aria-label={`활동 계정 ${index + 1} 삭제`}
                    onClick={() =>
                      onChange({
                        ...draft,
                        accounts: draft.accounts.filter((_, i) => i !== index),
                      })
                    }
                  >
                    삭제
                  </button>
                )}
              </div>
              <ApplicationInput
                label={config.label}
                aria-label={
                  draft.accounts.length > 1
                    ? `${config.label} ${index + 1}`
                    : config.label
                }
                required
                type="text"
                inputMode={account.channel === "instagram" ? "text" : "url"}
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
                maxLength={2048}
                placeholder={config.placeholder}
                help={config.help}
                value={accountInputValue(account.channel, account.url)}
                data-field={`accounts.${index}.url`}
                validate={(value) => {
                  try {
                    normalizeApplicationAccount(account.channel, value);
                    return "";
                  } catch (e) {
                    return e instanceof Error
                      ? e.message
                      : "활동 계정을 확인해주세요.";
                  }
                }}
                onChange={(url) =>
                  onChange({
                    ...draft,
                    accounts: draft.accounts.map((a, i) =>
                      i === index ? { ...a, url } : a,
                    ),
                  })
                }
              />
              {!["blog", "clip"].includes(account.channel) && (
                <p className={styles.fieldHelp}>
                  현재는 사전 등록만 가능해요. 채널 오픈 시 개별 안내합니다.
                </p>
              )}
            </div>
          );
        })}
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
      </section>
      {draft.operationType === "managed" && (
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontWeight: 400,
            lineHeight: 1.8,
          }}
        >
          <input
            type="checkbox"
            required
            checked={draft.authorityConsent || false}
            style={{ width: 18, height: 18, flexShrink: 0, marginTop: 3 }}
            onChange={(e) =>
              onChange({ ...draft, authorityConsent: e.target.checked })
            }
          />
          등록한 계정의 관리·게시 권한이 있으며, 각 계정 운영자에게 게시 및 유지
          조건을 확인했습니다. *
        </label>
      )}
      <ParticipantPaymentFields
        payment={draft.payment}
        onChange={(payment) => onChange({ ...draft, payment })}
      />
    </fieldset>
  );
}
