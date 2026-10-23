import type { Metadata } from "next";
import PublicShell from "@/components/public-shell";
import ApplicationForm from "./application-form";
import { rewardDefaults } from "@/lib/sales-cart";
export const metadata: Metadata = {
  title: "체험단 참여 신청 | One Marketing",
  description: "블로그·클립 크리에이터 참여 신청",
};
export default function Page() {
  return (
    <PublicShell>
      <ApplicationForm rewards={rewardDefaults} />
    </PublicShell>
  );
}
