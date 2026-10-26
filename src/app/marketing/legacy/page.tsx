import { MarketingShop } from "@/components/market-public";
import ProductOverview from "@/components/service-overview";
import { cookies } from "next/headers";
import { advertiserSession } from "@/lib/market";
import AdvertiserPriceAccess from "@/components/advertiser-price-access";
export const metadata = { title: "개별 견적 상품 | 원마케팅" };
export default async function Page() {
  const advertiser = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  return advertiser ? (
    <AdvertiserPriceAccess>
      <MarketingShop />
    </AdvertiserPriceAccess>
  ) : (
    <ProductOverview />
  );
}
