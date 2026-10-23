import ParticipantPortal from "@/components/participant-portal";
import PublicShell from "@/components/public-shell";
export const metadata = {
  title: "원케이션 · 나의 작업",
  referrer: "no-referrer" as const,
};
export default function Page() {
  return (
    <PublicShell>
      <ParticipantPortal />
    </PublicShell>
  );
}
