import Link from "next/link";
import DocumentationShell from "@/components/documentation-shell";
export const metadata = {
  title: "AI·MCP 가이드 | 원마케팅",
  robots: { index: true, follow: true },
};
export default function Page() {
  return (
    <DocumentationShell
      ai
      title="AI·MCP 가이드"
      description="사용하던 AI에서 캠페인 견적을 확인하고 주문을 접수할 수 있어요."
      sections={[
        {
          id: "intro",
          title: "MCP 소개",
          content: (
            <>
              <p>
                MCP는 AI가 외부 서비스의 도구를 사용할 수 있게 연결하는
                방식이에요. 원마케팅에 연결하면 상품 조회, 캠페인 견적, 내
                캠페인 조회, 주문 접수를 할 수 있어요.
              </p>
              <p>
                연결은 무료예요. 캠페인 상품의 제작비, 리워드와 운영비는 웹에서
                주문할 때와 같아요.
              </p>
            </>
          ),
        },
        {
          id: "connect",
          title: "계정 연결",
          content: (
            <>
              <ol>
                <li>
                  광고주 계정으로 로그인하고 AI 연결 관리에서 서버 주소를
                  확인해요.
                </li>
                <li>원격 MCP를 지원하는 클라이언트에서 주소를 등록해요.</li>
                <li>
                  OAuth 동의 화면에서 계정과 요청 권한을 확인하고 연결을
                  허용해요.
                </li>
              </ol>
              <p>
                Bearer 헤더를 설정할 수 있는 클라이언트는 별도 연결 키를 사용할
                수도 있어요. 연결 키는 비밀로 보관해주세요. 클라이언트별 제공
                기능과 설정 방법은 다를 수 있어요.
              </p>
              <Link href="/advertisers/connections">AI 연결 관리 →</Link>
            </>
          ),
        },
        {
          id: "example",
          title: "캠페인 작성 예시",
          content: (
            <>
              <blockquote>
                “블로그 게시자 5명, 1인 리워드 2만원으로 견적을 내줘. 제공
                원고를 게시하는 조건으로 모집하고 싶어. 모집과 게시 일정을 먼저
                같이 정하자.”
              </blockquote>
              <p>
                AI가 정리한 상품, 총액, 일정과 가이드를 확인하고 주문에
                동의해주세요. 주문 접수만으로 결제되거나 캠페인이 공개되지는
                않아요. 관리자 입금 확인 후 모집이 시작돼요.
              </p>
            </>
          ),
        },
        {
          id: "tools",
          title: "사용할 수 있는 도구",
          content: (
            <table>
              <thead>
                <tr>
                  <th>도구</th>
                  <th>하는 일</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>get_catalog</code>
                  </td>
                  <td>상품과 가격 기준 조회</td>
                </tr>
                <tr>
                  <td>
                    <code>quote_campaigns</code>
                  </td>
                  <td>입력한 조건으로 견적 확인</td>
                </tr>
                <tr>
                  <td>
                    <code>list_my_campaigns</code>
                  </td>
                  <td>본인의 주문과 캠페인 현황 조회</td>
                </tr>
                <tr>
                  <td>
                    <code>create_campaign_order</code>
                  </td>
                  <td>확인한 조건으로 주문 접수</td>
                </tr>
              </tbody>
            </table>
          ),
        },
        {
          id: "permissions",
          title: "권한과 결제",
          content: (
            <>
              <p>
                조회 권한과 주문 권한은 구분돼요. 다른 광고주의 자료, 관리자
                기능, 결제·리워드·환불 송금 권한은 제공하지 않아요.
              </p>
              <p>
                연결은 90일 후 만료되며 AI 연결 관리에서 해제할 수 있어요. 실제
                송금은 담당자가 처리하고 기록해요.
              </p>
            </>
          ),
        },
        {
          id: "skill",
          title: "Skill과 문제 해결",
          content: (
            <>
              <p>
                에이전트용 Skill에는 조건 확인, 견적 조회, 동의 후 주문하는
                순서를 정리했어요. Skill을 받아도 MCP 계정 연결은 별도로
                필요해요.
              </p>
              <a href="/skills/onemarketing/SKILL.md" download>
                Skill 안내 다운로드
              </a>
              <p>
                연결되지 않으면 클라이언트의 원격 MCP 지원 여부, 서버 주소, 연결
                만료 여부를 확인해주세요. Claude 등 추가 클라이언트의 OAuth 콜백
                주소는 운영 설정에 등록해야 할 수 있어요.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
