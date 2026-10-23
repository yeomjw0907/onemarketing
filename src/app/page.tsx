import Link from "next/link";
import PublicShell from "@/components/public-shell";
import styles from "@/components/platform.module.css";
export const metadata = {
  title: "원마케팅 | 대화에서 시작하는 캠페인",
  robots: { index: true, follow: true },
};
export default function Page() {
  return (
    <PublicShell>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>ONE MARKETING</span>
        <h1>
          브랜드의 다음 이야기,
          <br />
          사람과 함께.
        </h1>
        <p>
          AI로 만든 콘텐츠부터 블로그·클립 게시까지.
          <br />
          웹에서도, 사용하던 AI와의 대화에서도 캠페인을 시작하세요.
        </p>
        <div className={styles.actions}>
          <Link href="/marketing" className={styles.cta}>
            캠페인 만들기 →
          </Link>
          <Link href="/campaigns">참여할 캠페인 찾기</Link>
        </div>
      </section>
      <section className={styles.section}>
        <span className={styles.eyebrow}>CHOOSE YOUR WAY</span>
        <h2>필요한 만큼, 원하는 방식으로</h2>
        <div className={styles.columns}>
          <article className={styles.offer}>
            <h3>직접 모집</h3>
            <p>
              조건을 정하고 지원자를 직접 고르세요. 수락·제출 현황을 한곳에서
              확인합니다.
            </p>
            <Link href="/marketing">셀프 캠페인 보기 →</Link>
          </article>
          <article className={styles.offer}>
            <h3>제작·배포 패키지</h3>
            <p>
              블로그 5건과 클립 5건. 원고·이미지·영상 제작과 게시를 함께
              준비합니다.
            </p>
            <strong>200,000원</strong>
            <p className={styles.muted}>부가세 별도 · 최소 2주</p>
            <Link href="/marketing">구성 확인 →</Link>
          </article>
          <article className={styles.offer}>
            <h3>대화로 시작</h3>
            <p>
              AI 연결은 무료. 조건을 확인하고 캠페인을 준비한 뒤 내 계정에서
              진행합니다.
            </p>
            <Link href="/ai">AI 연결 알아보기 →</Link>
          </article>
        </div>
      </section>
      <section className={styles.section}>
        <h2>만들고, 게시하고, 함께 성장하세요.</h2>
        <p>
          원마케팅이 전달한 콘텐츠를 본인 채널에 게시하고 약정된 보수를 받는
          캠페인에 참여하세요. 직접 체험이 필요한 조건은 캠페인에서 별도로
          안내합니다.
        </p>
        <div className={styles.actions}>
          <Link href="/campaigns" className={styles.cta}>
            모집 중인 캠페인
          </Link>
          <Link href="/participants/apply">참여자로 가입하기</Link>
        </div>
      </section>
    </PublicShell>
  );
}
