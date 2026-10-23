import Link from "next/link";
import DocumentationShell from "@/components/documentation-shell";
export const metadata = {
  title: "이용 가이드 | 원마케팅",
  robots: { index: true, follow: true },
};
export default function Page() {
  return (
    <DocumentationShell
      title="이용 가이드"
      description="캠페인 등록부터 지원, 게시물 제출과 리워드 지급까지 이용 방법을 확인하세요."
      sections={[
        {
          id: "start",
          title: "시작하기",
          content: (
            <>
              <p>
                광고주는 캠페인을 등록하고, 체험단은 원하는 캠페인에 지원할 수
                있어요. 캠페인 목록과 요약은 비회원도 볼 수 있으며 상세 조건은
                로그인 후 확인할 수 있어요.
              </p>
              <div className="docs-links">
                <Link href="/signup">회원가입</Link>
                <Link href="/campaigns">캠페인 찾기 →</Link>
              </div>
            </>
          ),
        },
        {
          id: "advertiser",
          title: "광고주 이용 방법",
          content: (
            <>
              <ol>
                <li>
                  상품·가격에서 모집 인원, 리워드, 가이드와 일정을 입력해요.
                </li>
                <li>장바구니에서 금액과 조건을 확인하고 주문해요.</li>
                <li>
                  안내된 계좌로 입금하고 관리자 확인을 기다려요. 확인 후 모집이
                  시작돼요.
                </li>
                <li>
                  지원자를 선정하고 참여 수락 여부를 확인해요. 대행형은 담당자가
                  진행해요.
                </li>
                <li>게시물 주소를 검수하고 완료 내역과 정산을 확인해요.</li>
              </ol>
              <Link href="/marketing">캠페인 등록 →</Link>
            </>
          ),
        },
        {
          id: "participant",
          title: "체험단 이용 방법",
          content: (
            <>
              <ol>
                <li>체험단으로 가입하고 본인 활동 계정을 등록해요.</li>
                <li>
                  계정 승인과 소유 확인 후 캠페인의 리워드, 일정, 가이드를
                  확인해요.
                </li>
                <li>
                  캠페인에 지원하고 선정되면 ‘나의 활동’에서 참여 제안을
                  수락해요.
                </li>
                <li>
                  제공된 자료 또는 체험 조건에 맞춰 게시하고 게시물 주소를
                  제출해요.
                </li>
                <li>검수 결과와 수정 요청, 리워드 지급 내역을 확인해요.</li>
              </ol>
              <p>
                제품·서비스만 제공하는 캠페인에는 현금 리워드가 없어요. 지원 전
                제공 내역을 확인해주세요.
              </p>
              <Link href="/participants/portal">나의 활동 →</Link>
            </>
          ),
        },
        {
          id: "schedule",
          title: "모집과 참여 확정",
          content: (
            <>
              <p>
                모집 마감과 게시물 제출 기한은 서로 달라요. 조기 선정도
                가능하지만 선정 안내만으로 참여가 확정되지는 않아요. 참여 제안을
                기한 안에 수락해야 해요.
              </p>
              <p>
                모집 중에는 지원할 수 있고, 마감 후에는 선정·활동·검수 상태를
                확인할 수 있어요. 모집 인원이 찼다는 이유로 신청 인원을 숨기거나
                참여를 자동 확정하지 않아요.
              </p>
            </>
          ),
        },
        {
          id: "posting",
          title: "게시와 리워드",
          content: (
            <>
              <p>
                원고 제공형은 전달받은 원고와 이미지를 본인 채널에 게시하는
                방식이에요. 직접 체험한 후기처럼 작성하면 안 돼요. 방문형과
                배송형은 캠페인에 안내된 체험 조건을 확인해주세요.
              </p>
              <p>
                안내된 광고 표기를 넣고, 게시 유지 조건과 제출 기한을
                지켜주세요. 리워드는 게시물 검수 후 약정한 조건에 따라 지급돼요.
                구체적인 지급일은 해당 캠페인의 약정을 확인해주세요.
              </p>
              <Link href="/participants/guide">
                휴대전화에서 게시하는 방법 →
              </Link>
            </>
          ),
        },
        {
          id: "refund",
          title: "취소와 환불",
          content: (
            <>
              <p>
                입금 전 주문은 마이페이지에서 취소할 수 있어요. 입금 후에는
                캠페인별로 환불을 요청할 수 있으며, 수행한 작업과 미사용 금액을
                확인해 정산해요. 환불 승인과 실제 송금 완료는 별도로 표시돼요.
              </p>
              <Link href="/policy">환불 기준 확인 →</Link>
            </>
          ),
        },
      ]}
    />
  );
}
