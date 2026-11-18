import type { Metadata } from "next";
import Ga4Study from "./study";

export const metadata: Metadata = {
  title: "GA4 문제 검색 | 원마케팅",
  description:
    "GA4 문제 239개를 영어 원문과 한국어 요약으로 검색하고, 정답을 바로 확인하세요.",
  openGraph: {
    title: "GA4 문제 검색 | 원마케팅",
    description: "239개 문제를 검색하고 보기와 정답 번호를 바로 확인하세요.",
    url: "/ga4",
  },
};

export default function Ga4Page() {
  return <Ga4Study />;
}
