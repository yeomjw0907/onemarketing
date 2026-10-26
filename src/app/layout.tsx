import type { Metadata } from "next";
import "./globals.css";
import "./campaign-experience.css";
import "./public-refinement.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://www.onemarketing.kr"),
  title: "원마케팅 | 콘텐츠와 사람을 연결하는 캠페인",
  description: "마케팅 제작과 운영을 한 곳에서",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "One Marketing",
    title: "One Marketing",
    description: "마케팅의 모든 흐름을, 한곳에서.",
    images: [
      {
        url: "/og-onemarketing-v1.png",
        width: 1733,
        height: 907,
        alt: "One Marketing · 마케팅의 모든 흐름을, 한곳에서.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "One Marketing",
    description: "마케팅의 모든 흐름을, 한곳에서.",
    images: ["/og-onemarketing-v1.png"],
  },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
