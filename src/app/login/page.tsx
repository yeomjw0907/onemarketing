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
  return (
    <PublicShell>
      <LoginScreen next={next} register={p.signup === "1"} initialRole={role} />
    </PublicShell>
  );
}
