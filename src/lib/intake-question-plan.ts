import type { Question } from "../components/question-flow";
export function intakeQuestions(requested: string[]): Question[] {
  const q: Question[] = [];
  if (requested.includes("company"))
    q.push(
      {
        key: "companyName",
        title: "회사·브랜드 이름을 확인해주세요.",
        required: true,
      },
      { key: "contactName", title: "담당자님 이름을 알려주세요." },
      {
        key: "contactPhone",
        title: "연락받을 전화번호는요?",
        type: "tel",
        maxLength: 40,
      },
    );
  if (requested.includes("product"))
    q.push(
      {
        key: "productName",
        title: "어떤 제품·서비스를 홍보하나요?",
        required: true,
      },
      {
        key: "category",
        title: "어떤 제품군에 해당하나요?",
        custom: true,
        options: [
          { value: "음식·음료", label: "음식·음료" },
          { value: "뷰티·건강", label: "뷰티·건강" },
          { value: "생활용품", label: "생활용품" },
          { value: "여행·숙박", label: "여행·숙박" },
          { value: "서비스", label: "서비스" },
        ],
      },
      {
        key: "features",
        title: "꼭 알려야 할 장점이 있나요?",
        type: "textarea",
        hint: "성분·규격·사용법 등 확인된 사실을 적어주세요.",
      },
      { key: "target", title: "어떤 고객에게 소개하고 싶으세요?" },
      {
        key: "goal",
        title: "이번 홍보에서 가장 바라는 점은요?",
        custom: true,
        options: [
          { value: "브랜드 인지도", label: "더 많은 사람에게 알리고 싶어요" },
          { value: "매장 방문", label: "매장 방문을 늘리고 싶어요" },
          { value: "구매 유도", label: "제품 구매로 이어졌으면 해요" },
          { value: "신제품 소개", label: "새 제품을 소개하고 싶어요" },
        ],
      },
      { key: "salesScope", title: "어디에서 구매·이용할 수 있나요?" },
      {
        key: "forbidden",
        title: "피해야 할 표현이나 주의할 점이 있나요?",
        type: "textarea",
      },
    );
  if (requested.includes("campaign"))
    q.push(
      {
        key: "fulfillment",
        title: "어떤 방식으로 진행하나요?",
        required: true,
        options: [
          {
            value: "delivery",
            label: "제품을 보내드려요",
            detail: "참여자에게 제품을 배송해요",
          },
          {
            value: "visit",
            label: "매장에 방문해요",
            detail: "장소·예약 방법을 알려주세요",
          },
          { value: "content", label: "제공 자료로 콘텐츠를 만들어요" },
        ],
      },
      {
        key: "providedItems",
        title: "어떤 제품·서비스를 제공하나요?",
        type: "textarea",
        visible: (v) => v.fulfillment !== "content",
      },
      {
        key: "visitAddress",
        title: "어디로 방문하면 되나요?",
        visible: (v) => v.fulfillment === "visit",
      },
      {
        key: "visitTimes",
        title: "방문 가능한 시간·예약 방법은요?",
        type: "textarea",
        visible: (v) => v.fulfillment === "visit",
      },
      {
        key: "shippingDate",
        title: "언제 제품을 발송할 예정인가요?",
        type: "date",
        visible: (v) => v.fulfillment === "delivery",
      },
      {
        key: "startDate",
        title: "언제부터 홍보하고 싶으세요?",
        type: "date",
        hint: "희망하는 날짜를 선택해주세요. 아직 미정이라면 넘어가도 괜찮아요.",
      },
      {
        key: "budget",
        title: "생각하고 계신 예산이 있나요?",
        hint: "예산 범위 또는 ‘추천받고 싶어요’를 적어주세요.",
      },
    );
  if (requested.includes("links"))
    q.push({
      key: "links",
      title: "참고할 수 있는 링크를 알려주세요.",
      type: "textarea",
      hint: "홈페이지·제품 소개·공유 영상 주소를 한 줄에 하나씩 적어주세요.",
    });
  q.push({
    key: "notes",
    title: "추가로 전하고 싶은 내용이 있나요?",
    type: "textarea",
  });
  if (requested.includes("files"))
    q.push({
      key: "files",
      title: "사진·소개 자료를 추가해주세요.",
      hint: "자료는 4MB, MP4 영상은 40MB까지 등록할 수 있어요.",
    });
  return q;
}
