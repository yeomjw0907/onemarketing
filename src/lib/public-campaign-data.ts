import { cache } from "react";
import { campaignCatalog } from "./campaign-discovery";
// Request-scoped only: metadata and HTML see the same anonymous snapshot.
// Never cache viewer sessions, application details or private guides here.
export const publicCampaignCatalog = cache(campaignCatalog);
export const publicCampaignSummary = cache(async (id: string) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    return null;
  return (
    (await publicCampaignCatalog()).campaigns.find(
      (c) => c.id === id.toLowerCase(),
    ) || null
  );
});
