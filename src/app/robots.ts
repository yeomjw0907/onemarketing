import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/public-seo";

export default function robots(): MetadataRoute.Robots {
  // Private pages retain noindex metadata and authentication; allow crawlers to
  // read those directives instead of hiding them behind a robots exclusion.
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
