import { publicMetadata } from "@/lib/public-seo";
import PublicStructuredData from "@/components/public-structured-data";
import ProductOverview from "@/components/service-overview";
export const metadata = publicMetadata("/about");
export default function Page() {
  return (
    <>
      <PublicStructuredData path="/about" />
      <ProductOverview about />
    </>
  );
}
