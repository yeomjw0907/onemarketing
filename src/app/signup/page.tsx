import Link from "next/link";
import PublicShell from "@/components/public-shell";
import styles from "@/components/platform.module.css";
export const metadata = { title: "회원가입 | 원마케팅" };
export default function Page() {
  return (
    <PublicShell>
      <section className={styles.section}>
        <span className={styles.eyebrow}>WELCOME</span>
        <h1>어떤 일로 오셨나요?</h1>
        <p>이용 목적에 맞는 가입 절차를 안내할게요.</p>
        <div className={styles.columns}>
          <article className={styles.offer}>
            <h2>광고주</h2>
            <p>브랜드의 캠페인을 만들고 지원자·콘텐츠·비용을 관리합니다.</p>
            <Link className={styles.cta} href="/login?signup=1">
              광고주로 가입
            </Link>
          </article>
          <article className={styles.offer}>
            <h2>참여자</h2>
            <p>내 블로그·클립 채널로 캠페인에 참여하고 게시 보수를 받습니다.</p>
            <Link className={styles.cta} href="/participants/apply">
              참여자로 가입
            </Link>
          </article>
        </div>
        <p>
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      </section>
    </PublicShell>
  );
}
