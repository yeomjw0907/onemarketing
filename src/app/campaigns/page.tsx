import { publicMetadata } from "@/lib/public-seo";
import { publicCampaignCatalog } from "@/lib/public-campaign-data";
import PublicStructuredData from "@/components/public-structured-data";
import CampaignBrowser from "@/components/campaign-browser";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ searchParams }: Props) {
  const metadata = publicMetadata("/campaigns");
  if (Object.keys(await searchParams).length)
    metadata.robots = { index: false, follow: true };
  return metadata;
}
export default async function Page({ searchParams }: Props) {
  const [data, params] = await Promise.all([
    publicCampaignCatalog(),
    searchParams,
  ]);
  return (
    <>
      <PublicStructuredData
        path="/campaigns"
        campaigns={data.campaigns}
        campaignList={!Object.keys(params).length}
      />
      <CampaignBrowser initialData={data} />
    </>
  );
}
