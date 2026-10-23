import AdvertiserConsent from "@/components/advertiser-consent";
import { mcpConsent } from "@/lib/advertiser-oauth";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "AI 연결 동의 | 원마케팅",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request = "" } = await searchParams;
  let consent = { clientName: "", scopes: [] as string[] },
    error = "";
  try {
    consent = await mcpConsent(request);
  } catch {
    error = "연결 요청이 만료되었습니다. AI에서 다시 연결을 시작하세요.";
  }
  return <AdvertiserConsent request={request} {...consent} error={error} />;
}
