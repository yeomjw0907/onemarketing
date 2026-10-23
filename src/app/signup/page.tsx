import { safeReturnPath } from "@/lib/campaign-display";
import Link from "next/link";
import PublicShell from "@/components/public-shell";
import styles from "@/components/platform.module.css";
export const metadata = { title: "회원가입 | 원마케팅" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnPath((await searchParams).next);
  return (
    <PublicShell>
      <section className={styles.section}>
        <h1>회원가입</h1>
        <p>광고주 또는 체험단으로 가입할 수 있어요.</p>
        <div className={styles.columns}>
          <article className={styles.offer}>
            <h2>광고주</h2>
            <p>브랜드의 캠페인을 만들고 지원자·콘텐츠·비용을 관리합니다.</p>
            <Link
              className={styles.cta}
              href={
                "/login?signup=1" +
                (next ? "&next=" + encodeURIComponent(next) : "")
              }
            >
              광고주로 가입
            </Link>
          </article>
          <article className={styles.offer}>
            <h2>체험단</h2>
            <p>
              내 블로그·클립 채널로 캠페인에 참여하고 게시 리워드를 받습니다.
            </p>
            <Link
              className={styles.cta}
              href={
                "/participants/apply" +
                (next ? "?next=" + encodeURIComponent(next) : "")
              }
            >
              체험단으로 가입
            </Link>
          </article>
        </div>
        <p>
          이미 계정이 있나요?{" "}
          <Link
            href={"/login" + (next ? "?next=" + encodeURIComponent(next) : "")}
          >
            로그인
          </Link>
        </p>
      </section>
    </PublicShell>
  );
}
