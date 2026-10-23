import CampaignBrowser from "@/components/campaign-browser";
export const metadata = {
  title: "캠페인 찾기 | 원마케팅",
  description: "업종, 채널, 지역으로 캠페인을 검색하세요.",
  robots: { index: true, follow: true },
};
export default function Page() {
  return <CampaignBrowser />;
}
