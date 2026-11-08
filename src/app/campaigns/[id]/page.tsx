import CampaignDetail from "@/components/campaign-detail";
import { notFound } from "next/navigation";
import { publicCampaignSummary } from "@/lib/public-campaign-data";
import { campaignMetadata, campaignStructuredData } from "@/lib/public-seo";
import { StructuredData } from "@/components/public-structured-data";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const summary = await publicCampaignSummary((await params).id);
  if (!summary) notFound();
  return campaignMetadata(summary);
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const summary = await publicCampaignSummary(id);
  if (!summary) notFound();
  return (
    <>
      <StructuredData value={campaignStructuredData(summary)} />
      <CampaignDetail id={summary.id} initialSummary={summary} />
    </>
  );
}
