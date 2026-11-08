import { actor } from "@/lib/auth";
import Link from "next/link";
import PlatformFunnel from "@/components/platform-funnel";
export const metadata = {
  title: "가입·전환·정산 분석 | 관리자",
  robots: { index: false, follow: false },
};
export default async function Page() {
  if (!(await actor()))
    return (
      <main style={{ padding: 32 }}>
        <h1>가입·전환·정산 분석</h1>
        <p>관리자 로그인이 필요합니다.</p>
        <Link href="/admin">관리자 로그인</Link>
      </main>
    );
  return <PlatformFunnel />;
}
