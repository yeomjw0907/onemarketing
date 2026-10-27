import IntakeForm from "@/components/intake-form";
export const metadata = {
  title: "자료 전달 | 원마케팅",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return <IntakeForm />;
}
