import Link from "next/link";
import PublicShell from "@/components/public-shell";
import styles from "@/components/platform.module.css";
export const metadata = {
  title: "AI로 캠페인 만들기 | 원마케팅",
  robots: { index: true, follow: true },
};
export default function Page() {
  return (
    <PublicShell>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>CHAT TO CAMPAIGN</span>
        <h1>
          하던 대화에서,
          <br />
          모집까지.
        </h1>
        <p>“블로그 게시자 5명 모집해줘. 제공 원고를 게시하는 조건으로.”</p>
        <Link className={styles.cta} href="/advertisers/connections">
          내 계정에서 AI 연결하기 →
        </Link>
      </section>
      <section className={styles.section}>
        <h2>연결은 무료, 실행은 확인 후.</h2>
        <ol>
          <li>광고주 계정으로 로그인하고 연결을 승인하세요.</li>
          <li>가격과 조건을 조회하고 캠페인 초안을 준비하세요.</li>
          <li>총액·일정·가이드를 확인한 뒤 주문하세요.</li>
          <li>마이페이지에서 지원·제출·비용을 확인하세요.</li>
        </ol>
        <p>
          AI 연결 자체에 비용을 받지 않습니다. 주문한 상품의
          제작비·리워드·운영비가 적용됩니다. 결제·환불 송금은 자동 실행하지
          않습니다.
        </p>
        <Link href="/policy">운영·환불 기준 확인</Link>
      </section>
    </PublicShell>
  );
}
