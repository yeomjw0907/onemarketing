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
  return (
    <fieldset
      disabled={disabled}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <div className={styles.fieldGrid}>
        <ApplicationInput
          label="이름"
          required
          autoComplete="name"
          maxLength={200}
          placeholder="이름을 입력해주세요"
          value={draft.name}
          onChange={(name) => onChange({ ...draft, name })}
        />
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
      <ParticipantPaymentFields
        payment={draft.payment}
        onChange={(payment) => onChange({ ...draft, payment })}
      />
    </fieldset>
  );
}
