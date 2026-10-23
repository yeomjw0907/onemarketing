import CampaignBrowser from "@/components/campaign-browser";
export const metadata = {
  title: "원마케팅 | 체험단 캠페인",
  description: "모집 중인 체험단 캠페인을 확인하고 지원하세요.",
  robots: { index: true, follow: true },
};
export default function Page() {
  return <CampaignBrowser home />;
}
