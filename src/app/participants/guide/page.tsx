import Link from "next/link";
export default function Guide() {
  return (
    <main className="participant-portal participant-guide">
      <span className="ui-eyebrow">원케이션</span>
      <h1>원케이션 참여 가이드</h1>
      <h2>참여 방법</h2>
      <ol>
        <li>계정 등록 및 운영 권한 확인</li>
        <li>캠페인 조건·원고료·제출 기한 확인 후 수락</li>
        <li>승인된 원고와 파일을 확인하고 지정 계정에 게시</li>
        <li>참여자 화면에 게시물 링크 제출</li>
        <li>제출 후 3일 뒤 검수, 통과 후 원고료 지급 처리</li>
      </ol>
      <h2>게시 기준</h2>
      <p>
        제공된 광고 표시·필수 정보와 이미지 순서를 유지해주세요. 실제 체험하지
        않은 내용을 체험한 것처럼 표현하지 마세요. 캠페인별 상세 가이드는 작업
        화면에서 확인할 수 있습니다.
      </p>
      <h2>게시 유지</h2>
      <p>
        검수 승인일부터 90일 동안 공개 상태를 유지해주세요. 삭제·비공개나 계정
        문제가 생기면 담당자에게 알려주세요.
      </p>
      <h2>추천 보상</h2>
      <p>
        추천받은 회원의 원고료 지급 완료 시 블로그·클립 단독 500원, 묶음 완료
        1,200원이 추천인에게 적립됩니다. 직접 추천 관계에 한하며 자기·순환
        추천은 허용되지 않습니다. 지급 취소 시 관련 추천료가 조정됩니다.
      </p>
      <Link href="/participants/apply">참여자 등록 신청</Link>
    </main>
  );
}
