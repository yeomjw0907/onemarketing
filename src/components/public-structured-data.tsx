import {
  publicStructuredData,
  serializeStructuredData,
  type PublicPath,
} from "@/lib/public-seo";
import type { CampaignSummary } from "@/lib/campaign-display";

export function StructuredData({ value }: { value: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeStructuredData(value),
      }}
    />
  );
}
export default function PublicStructuredData({
  path,
  ...options
}: {
  path: PublicPath;
  campaigns?: CampaignSummary[];
  services?: boolean;
  campaignList?: boolean;
}) {
  return <StructuredData value={publicStructuredData(path, options)} />;
}
