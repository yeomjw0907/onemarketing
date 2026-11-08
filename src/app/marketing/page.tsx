import { publicMetadata } from "@/lib/public-seo";
import PublicStructuredData from "@/components/public-structured-data";
import CommerceShop from "@/components/commerce-shop";
import ProductOverview from "@/components/service-overview";
import { cookies } from "next/headers";
import { advertiserSession } from "@/lib/market";
import AdvertiserPriceAccess from "@/components/advertiser-price-access";
export const metadata = publicMetadata("/marketing");
export default async function Page() {
  const advertiser = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  return (
    <>
      <PublicStructuredData path="/marketing" />
      {advertiser ? (
        <AdvertiserPriceAccess>
          <CommerceShop />
        </AdvertiserPriceAccess>
      ) : (
        <ProductOverview />
      )}
    </>
  );
}
