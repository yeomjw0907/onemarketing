import Link from "next/link";
import PublicShell from "@/components/public-shell";
import { AdvertiserAccess } from "@/components/market-public";
import styles from "@/components/platform.module.css";
export const metadata = { title: "로그인 | 원마케팅" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string }>;
}) {
  const params = await searchParams;
  return (
    <PublicShell>
      <section className={styles.section}>
        <h1>다시 만나 반가워요.</h1>
        <div className={styles.tabs}>
          <a href="#advertiser-login">광고주</a>
          <Link href="/participants/portal">참여자 로그인</Link>
        </div>
        <div id="advertiser-login">
          <AdvertiserAccess register={params.signup === "1"} />
        </div>
        <p>
          관리 업무는 <Link href="/admin">관리자 로그인</Link>에서 진행하세요.
        </p>
      </section>
    </PublicShell>
  );
}
