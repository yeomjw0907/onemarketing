import CommerceShop from "@/components/commerce-shop";
import ProductOverview from "@/components/service-overview";
import { cookies } from "next/headers";
import { advertiserSession } from "@/lib/market";
import AdvertiserPriceAccess from "@/components/advertiser-price-access";
export const metadata = {
  title: "마케팅 상품 | 원마케팅",
  description: "체험단 모집과 콘텐츠 제작·게시, 필요한 구성으로 시작하세요.",
};
export default async function Page() {
  const advertiser = await advertiserSession(
    (await cookies()).get("om_advertiser")?.value,
  );
  return advertiser ? (
    <AdvertiserPriceAccess>
      <CommerceShop />
    </AdvertiserPriceAccess>
  ) : (
    <ProductOverview />
  );
}
