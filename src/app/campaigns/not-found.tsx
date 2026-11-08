import Link from "next/link";
import PublicShell from "@/components/public-shell";
export default function NotFound() {
  return (
    <PublicShell>
      <section style={{ maxWidth: 800, margin: "48px auto", padding: 24 }}>
        <h1>캠페인을 찾을 수 없어요</h1>
        <p>주소를 확인하거나 현재 공개 중인 캠페인을 찾아보세요.</p>
        <Link href="/campaigns">캠페인 찾기로 이동</Link>
      </section>
    </PublicShell>
  );
}
