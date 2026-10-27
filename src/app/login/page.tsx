import Link from "next/link";
import styles from "./signup-shell.module.css";
import { safeReturnPath } from "@/lib/campaign-display";
import PublicShell from "@/components/public-shell";
import LoginScreen from "@/components/login-screen";
export const metadata = { title: "로그인 | 원마케팅" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string; next?: string; role?: string }>;
}) {
  const p = await searchParams,
    next = safeReturnPath(p.next);
  const role =
    p.role === "advertiser" || p.signup === "1" || next === "/marketing"
      ? "advertiser"
      : p.role === "participant" || next.startsWith("/campaigns/")
        ? "participant"
        : "advertiser";
  if (p.signup === "1" && role === "advertiser")
    return (
      <main className={styles.root}>
        <Link href="/" className={styles.brand}>
          원마케팅
        </Link>
        <LoginScreen next={next} register initialRole={role} />
      </main>
    );
  return (
    <PublicShell>
      <LoginScreen next={next} register={p.signup === "1"} initialRole={role} />
    </PublicShell>
  );
}
