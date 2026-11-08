import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/public-seo";
import { publicCampaignCatalog } from "@/lib/public-campaign-data";
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries((await publicCampaignCatalog()).campaigns);
}
