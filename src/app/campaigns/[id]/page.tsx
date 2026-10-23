import CampaignDetail from "@/components/campaign-detail";
export const metadata = {
  title: "캠페인 상세 | 원마케팅",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignDetail id={id} />;
}
