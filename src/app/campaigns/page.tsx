import { publicMetadata } from "@/lib/public-seo";
import PublicStructuredData from "@/components/public-structured-data";
import CampaignBrowser from "@/components/campaign-browser";
export const metadata = publicMetadata("/campaigns");
export default function Page() {
  return (
    <>
      <PublicStructuredData path="/campaigns" />
      <CampaignBrowser />
    </>
  );
}
