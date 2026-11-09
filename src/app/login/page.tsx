import Link from "next/link";
import styles from "./signup-shell.module.css";
import PublicShell from "@/components/public-shell";
import LoginScreen from "@/components/login-screen";
import {
  loginEntryRole,
  safeLoginReturnPath,
  safeParticipantPortalReturn,
} from "@/lib/login-entry";
export const metadata = { title: "로그인 | 원마케팅" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ signup?: string; next?: string; role?: string }>;
}) {
  const p = await searchParams,
    next = safeLoginReturnPath(p.next) || safeParticipantPortalReturn(p.next);
  const role = loginEntryRole(p.role, p.signup, next);
  if (p.signup === "1")
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
