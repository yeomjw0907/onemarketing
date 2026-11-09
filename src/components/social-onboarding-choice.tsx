"use client";
import styles from "./advertiser-signup.module.css";
export default function SocialOnboardingChoice({
  role,
  busy = false,
  onNew,
  onExisting,
  onRestart,
}: {
  role: "advertiser" | "participant";
  busy?: boolean;
  onNew: () => void;
  onExisting: () => void;
  onRestart?: () => void;
}) {
  const label = role === "advertiser" ? "광고주" : "체험단";
  return (
    <section className={styles.entry} aria-label="간편 인증 후 시작 방법">
      <p className={styles.eyebrow}>{label} 계정으로 시작하기</p>
      <h2>간편 인증을 마쳤어요.</h2>
      <p>이 간편 로그인에 연결된 {label} 계정이 아직 없어요.</p>
      <p>
        처음이라면 가입을 이어가고, 이미 가입했다면 기존 계정 연결을
        선택해주세요.
      </p>
      <button
        type="button"
        className={styles.primary}
        disabled={busy}
        onClick={onNew}
      >
        새 계정으로 가입하기
      </button>
      <button
        type="button"
        className={styles.login}
        disabled={busy}
        onClick={onExisting}
      >
        기존 계정에 연결하기
      </button>
      <p className="muted small">
        광고주와 체험단은 각각 가입·연결해요. 이름이나 이메일만으로 자동
        연결하지 않아요.
      </p>
      {onRestart && (
        <button
          type="button"
          className={styles.login}
          disabled={busy}
          onClick={onRestart}
        >
          다른 간편 계정으로 인증하기
        </button>
      )}
    </section>
  );
}
