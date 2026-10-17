export default function ClipPostingNotes() {
  return (
    <details className="posting-clip-notes">
      <summary>클립 게시 전 확인해주세요</summary>
      <ul>
        <li>
          동영상은 별도 제목칸 대신 본문에 설명을 입력해요. 공식 모바일 화면
          기준 최소 10자, 최대 300자예요.
        </li>
        <li>
          해시태그는 최대 5개까지 넣을 수 있어요. 영상과 가장 가까운 카테고리도
          선택해주세요.
        </li>
        <li>
          광고 콘텐츠는 ‘광고·협찬 설정’을 켜주세요. AI를 활용한 콘텐츠는 ‘AI
          활용 설정’도 켜주세요.
        </li>
        <li>최종 공개 설정이 ‘전체 공개’인지 확인해주세요.</li>
      </ul>
      <a
        href="https://help.naver.com/service/30048/contents/24422?osType=COMMONOS&ostype=commonos"
        target="_blank"
        rel="noreferrer"
      >
        네이버 공식 게시 안내
      </a>
    </details>
  );
}
