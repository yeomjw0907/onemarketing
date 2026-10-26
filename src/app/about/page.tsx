import ProductOverview from "@/components/service-overview";
export const metadata = {
  title: "서비스 소개 | 원마케팅",
  description:
    "체험단 모집부터 콘텐츠 제작과 게시 확인까지, 원마케팅 서비스를 알아보세요.",
};
export default function Page() {
  return <ProductOverview about />;
}
