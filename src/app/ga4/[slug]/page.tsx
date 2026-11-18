import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { questions } from "../questions";
import Ga4Study from "../study";

export function generateStaticParams() {
  return questions.map((q) => ({ slug: q.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const question = questions.find((q) => q.slug === slug);
  return {
    title: question
      ? `${question.title} | GA4 스터디`
      : "문제를 찾을 수 없습니다",
    description: question?.answerKo || question?.explanation,
  };
}
export default async function QuestionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const question = questions.find((q) => q.slug === slug);
  if (!question) notFound();
  return <Ga4Study initialQuestion={question} />;
}
