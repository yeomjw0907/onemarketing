import type { MetadataRoute } from "next";
import { publicPages, siteUrl } from "@/lib/public-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.keys(publicPages).map((path) => ({
    url: new URL(path, siteUrl).href,
  }));
}
