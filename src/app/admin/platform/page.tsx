import { CommerceBoard } from "@/components/commerce-board";
export const metadata = {
  title: "주문·캠페인 운영 | 관리자",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <CommerceBoard admin />;
}
