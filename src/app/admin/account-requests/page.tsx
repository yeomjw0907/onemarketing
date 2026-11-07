import AccountHelp from "@/components/account-help";
export const metadata = {
  title: "회원 요청 관리 | 원마케팅",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AccountHelp admin />;
}
