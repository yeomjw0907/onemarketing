"use client";
import { useState } from "react";
import QuestionFlow, { type Question } from "./question-flow";
import { marketFetch } from "./public-fetch";
const questions: Question[] = [
  {
    key: "businessType",
    title: "어떤 형태로 운영하고 계세요?",
    required: true,
    options: [
      {
        value: "corporation",
        label: "법인사업자예요",
        detail: "법인 명의로 운영하고 있어요",
      },
      {
        value: "individual",
        label: "개인사업자예요",
        detail: "사업자등록을 마친 개인사업자예요",
      },
      {
        value: "preparing",
        label: "개인·창업 준비 중이에요",
        detail: "아직 사업자등록 전이어도 괜찮아요",
      },
    ],
  },
  {
    key: "companyName",
    title: "업체 이름을 알려주세요.",
    hint: "개인이라면 활동명이나 준비 중인 이름을 적어주세요.",
    required: true,
  },
  { key: "brand", title: "고객에게 알려질 브랜드 이름은요?", required: true },
  {
    key: "businessNumber",
    title: "사업자등록번호를 입력해주세요.",
    required: true,
    maxLength: 12,
    validate: (v) =>
      /^\d{10}$/.test(v.replace(/[- ]/g, ""))
        ? null
        : "사업자등록번호는 숫자 10자리로 입력해주세요.",
    visible: (v) => v.businessType !== "preparing",
  },
  {
    key: "industry",
    title: "어떤 제품이나 서비스를 제공하세요?",
    required: true,
    custom: true,
    options: [
      { value: "음식점·카페", label: "음식점·카페" },
      { value: "뷰티·건강", label: "뷰티·건강" },
      { value: "패션·생활용품", label: "패션·생활용품" },
      { value: "여행·숙박", label: "여행·숙박" },
      { value: "교육·전문서비스", label: "교육·전문서비스" },
    ],
  },
  {
    key: "description",
    title: "제품·서비스를 조금 더 소개해주세요.",
    hint: "무엇을 제공하고, 어떤 점이 좋은지 편하게 적어주세요.",
    type: "textarea",
    required: true,
    minLength: 5,
    maxLength: 2000,
  },
  {
    key: "address",
    title: "어느 지역에서 운영하고 계세요?",
    hint: "사업장 주소 또는 주요 활동 지역을 알려주세요.",
    required: true,
  },
  {
    key: "website",
    title: "둘러볼 수 있는 링크가 있나요?",
    hint: "홈페이지·쇼핑몰·네이버 플레이스 주소를 알려주세요.",
    type: "url",
    maxLength: 2000,
  },
  { key: "name", title: "담당자님 이름을 알려주세요.", required: true },
  {
    key: "phone",
    title: "연락받을 휴대전화 번호는요?",
    type: "tel",
    required: true,
    maxLength: 20,
    validate: (v) =>
      /^01\d{8,9}$/.test(v.replace(/\D/g, ""))
        ? null
        : "휴대전화 번호를 확인해주세요.",
  },
  {
    key: "email",
    title: "이메일 주소를 알려주세요.",
    hint: "로그인과 캠페인 연락에 사용해요.",
    type: "email",
    required: true,
    maxLength: 254,
  },
  {
    key: "password",
    title: "로그인 비밀번호를 정해주세요.",
    hint: "10자 이상 입력해주세요.",
    type: "password",
    required: true,
    minLength: 10,
    maxLength: 128,
    visible: (v) => v.social !== "true",
  },
  {
    key: "consent",
    title: "정보 수집·이용에 동의해주세요.",
    type: "checkbox",
    required: true,
    hint: "계정 관리와 캠페인 연락을 위해 업체 정보·이름·이메일·전화번호를 수집·이용하는 데 동의합니다. 계정 정보는 탈퇴 시 삭제하며 계약·거래 정보는 별도 보관 기준을 따릅니다.",
  },
];
export default function AdvertiserSignup({
  social,
  onComplete,
  onLogin,
  kakao,
  externalError,
}: {
  social: boolean;
  onComplete: (account: Record<string, any>) => void;
  onLogin: () => void;
  externalError?: string;
  kakao: React.ReactNode;
}) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <QuestionFlow
        title="광고주 회원가입"
        questions={questions}
        values={{ ...values, social: String(social) }}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        busy={busy}
        error={error || externalError}
        completeLabel="가입 완료하기"
        onComplete={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await marketFetch("/api/advertiser-auth", {
              ...values,
              businessNumber:
                values.businessType === "preparing"
                  ? ""
                  : values.businessNumber,
              website: values.website || "",
              phone: (values.phone || "").replace(/\D/g, ""),
              consent: values.consent === "true",
              action: social ? "social-register" : "register",
            });
            onComplete(result.account);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        footer={
          <button
            type="button"
            disabled={busy}
            onClick={onLogin}
            style={{
              display: "block",
              margin: "12px auto",
              background: "none",
              border: 0,
              color: "#6b7684",
              padding: 12,
            }}
          >
            {social ? "기존 계정에 카카오 연결" : "이미 계정이 있어요 · 로그인"}
          </button>
        }
      />
      {!social && kakao}
    </>
  );
}
