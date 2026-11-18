import { bilingual } from "./bilingual";
import suppliedQuestions from "./data/source-questions.json";
import { koreanSummaries } from "./translations";
import { answerVerifications } from "./answer-verifications";

export const topics = [
  "전체",
  "이벤트 수집",
  "보고서",
  "탐색",
  "광고·기여분석",
  "설정·연동",
  "맞춤 데이터",
] as const;
export type Topic = (typeof topics)[number];
export type Question = {
  slug: string;
  topic: Exclude<Topic, "전체">;
  title: string;
  options: string[];
  answer: number;
  explanation: string;
  source: string;
  titleEn?: string;
  answerEn?: string;
  searchTerms?: string[];
  correctAnswer?: string;
  answerKo?: string;
  sourceId?: number;
  sourceQuestion?: string;
  reviewStatus?: string;
  reviewNote?: string;
  urlDerivedTitle?: boolean;
  answerVerification?: string;
};

export function getAnswer(question: Question) {
  return question.correctAnswer ?? question.options[question.answer] ?? "";
}

const events = "https://support.google.com/analytics/answer/9322688?hl=ko";
const enhanced = "https://support.google.com/analytics/answer/9216061?hl=ko";
const realtime = "https://support.google.com/analytics/answer/9271392?hl=ko";
const custom = "https://support.google.com/analytics/answer/14240153?hl=ko";

// Original practice questions, independent of the official certification exam.
const originalPracticeQuestions: Question[] = [
  {
    slug: "event-model",
    topic: "이벤트 수집",
    title:
      "GA4에서 페이지 조회나 버튼 클릭 같은 사용자 상호작용은 무엇으로 수집할까요?",
    options: ["이벤트", "계정", "데이터 필터", "잠재고객"],
    answer: 0,
    explanation:
      "GA4는 웹사이트와 앱에서 일어나는 상호작용을 이벤트로 수집합니다. 페이지 조회, 구매, 외부 링크 클릭 등을 각각의 이벤트로 분석할 수 있습니다.",
    source: events,
  },
  {
    slug: "enhanced-measurement",
    topic: "이벤트 수집",
    title:
      "웹 스트림에서 스크롤이나 외부 링크 클릭을 추가 코드 작성 없이 측정하려면 어떤 기능을 사용할까요?",
    options: ["맞춤 측정기준", "향상된 측정", "데이터 가져오기", "보고서 비교"],
    answer: 1,
    explanation:
      "향상된 측정은 웹 데이터 스트림에서 지원하는 상호작용을 설정으로 수집하는 기능입니다. Google 태그가 설치되어 있어야 하며, 수집할 항목을 선택할 수 있습니다.",
    source: enhanced,
  },
  {
    slug: "event-parameters",
    topic: "이벤트 수집",
    title:
      "이벤트에 클릭한 링크의 URL 같은 추가 정보를 함께 보내는 값은 무엇일까요?",
    options: ["속성 이름", "계정 권한", "이벤트 매개변수", "보고서 제목"],
    answer: 2,
    explanation:
      "매개변수는 이벤트의 맥락을 설명하는 추가 정보입니다. 예를 들어 외부 링크 클릭 이벤트의 link_url은 사용자가 이동한 주소를 알려줍니다.",
    source: events,
  },
  {
    slug: "video-events",
    topic: "이벤트 수집",
    title:
      "향상된 측정으로 동영상 참여 이벤트를 수집할 수 있는 경우는 무엇일까요?",
    options: [
      "모든 외부 동영상 링크",
      "모든 GIF 이미지",
      "모든 로컬 동영상 파일",
      "JavaScript API를 지원하는 삽입된 YouTube 동영상",
    ],
    answer: 3,
    explanation:
      "향상된 측정의 동영상 참여는 JavaScript API를 지원하는 삽입된 YouTube 동영상에 적용됩니다. 재생 시작, 진행, 완료 이벤트 등을 수집합니다.",
    source: enhanced,
  },
  {
    slug: "realtime-window",
    topic: "보고서",
    title:
      "실시간 보고서의 ‘지난 30분 동안의 활성 사용자’는 어떤 범위의 활동을 보여줄까요?",
    options: [
      "오늘 자정부터의 활동",
      "가장 최근 30분의 활동",
      "직전 달 전체의 활동",
      "속성을 만든 이후 모든 활동",
    ],
    answer: 1,
    explanation:
      "이 카드는 최근 30분 동안 사이트나 앱을 이용한 사용자를 보여줍니다. 날짜별 추세를 비교하는 보고서와는 시간 범위가 다릅니다.",
    source: realtime,
  },
  {
    slug: "verify-event",
    topic: "보고서",
    title:
      "새로 설치한 이벤트가 최근에 수집되었는지 빠르게 확인할 때 볼 수 있는 카드는 무엇일까요?",
    options: [
      "실시간 보고서의 이벤트 이름별 이벤트 수",
      "계정의 사용자 관리 목록",
      "결제 정보",
      "속성 변경 내역의 제목",
    ],
    answer: 0,
    explanation:
      "실시간 보고서의 이벤트 이름별 이벤트 수 카드를 통해 최근 발생한 이벤트와 발생 횟수를 살펴볼 수 있습니다. 디버깅에는 DebugView도 활용할 수 있습니다.",
    source: events,
  },
  {
    slug: "key-event",
    topic: "보고서",
    title:
      "문의 완료처럼 비즈니스에 특히 중요한 행동을 GA4에서 구분하려면 어떻게 할까요?",
    options: [
      "속성 이름을 변경한다",
      "보고서를 삭제한다",
      "해당 이벤트를 주요 이벤트로 표시한다",
      "모든 이벤트 수집을 중지한다",
    ],
    answer: 2,
    explanation:
      "비즈니스 성과에 중요한 행동을 측정하는 이벤트를 주요 이벤트로 표시할 수 있습니다. 해당 행동이 발생하면 주요 이벤트로 기록되어 보고서에서 분석할 수 있습니다.",
    source: "https://support.google.com/analytics/answer/12926615?hl=ko",
  },
  {
    slug: "realtime-purpose",
    topic: "보고서",
    title: "실시간 보고서를 활용하기에 가장 적합한 상황은 무엇일까요?",
    options: [
      "지난 3년의 연간 성과를 비교한다",
      "계정의 결제 수단을 변경한다",
      "사용자의 비밀번호를 확인한다",
      "방금 게시한 콘텐츠에 방문과 이벤트가 들어오는지 확인한다",
    ],
    answer: 3,
    explanation:
      "실시간 보고서는 현재 사이트나 앱에서 일어나는 활동을 확인하는 데 유용합니다. 장기적인 성과 비교는 해당 기간을 설정할 수 있는 다른 보고서에서 진행합니다.",
    source: realtime,
  },
  {
    slug: "custom-dimension",
    topic: "맞춤 데이터",
    title:
      "직접 수집한 ‘클릭한 버튼 이름’을 범주별로 분석하려면 무엇을 만드는 것이 적합할까요?",
    options: [
      "맞춤 측정항목",
      "맞춤 측정기준",
      "새 결제 계정",
      "데이터 삭제 요청",
    ],
    answer: 1,
    explanation:
      "버튼 이름이나 콘텐츠 유형 같은 범주형 데이터에는 맞춤 측정기준이 적합합니다. 숫자로 측정하는 값에는 맞춤 측정항목을 사용합니다.",
    source: "https://support.google.com/analytics/answer/14239619?hl=ko",
  },
  {
    slug: "custom-data-flow",
    topic: "맞춤 데이터",
    title:
      "맞춤 이벤트 매개변수를 일반 보고서에서 분석하려면 어떤 준비가 필요할까요?",
    options: [
      "보고서 이름만 매개변수 이름으로 바꾼다",
      "Google Ads 계정만 새로 만든다",
      "매개변수를 전송하고 이에 대응하는 맞춤 정의를 만든다",
      "사이트의 모든 기본 이벤트를 삭제한다",
    ],
    answer: 2,
    explanation:
      "맞춤 데이터는 먼저 이벤트 매개변수나 사용자 속성으로 전송해야 합니다. 그 값을 분석할 수 있도록 적절한 범위의 맞춤 측정기준 또는 측정항목을 설정합니다.",
    source: custom,
  },
  {
    slug: "custom-processing",
    topic: "맞춤 데이터",
    title:
      "맞춤 측정기준을 만들고 데이터를 보내기 시작했습니다. 보고서에서 활용하기까지 보통 얼마나 기다릴 수 있을까요?",
    options: [
      "24~48시간",
      "항상 1초 이내",
      "정확히 1년",
      "데이터는 절대 표시되지 않는다",
    ],
    answer: 0,
    explanation:
      "Google 안내에 따르면 맞춤 측정기준이나 측정항목 설정 후 보고와 광고에 활용할 수 있기까지 24~48시간이 걸릴 수 있습니다. 실시간 수집 확인과 보고서 처리는 구분해서 살펴보세요.",
    source: custom,
  },
  {
    slug: "numeric-metric",
    topic: "맞춤 데이터",
    title:
      "‘독서 시간(초)’처럼 숫자로 측정하는 맞춤 값을 분석하려면 어떤 정의가 적합할까요?",
    options: [
      "맞춤 잠재고객 이름",
      "페이지 제목",
      "계정 표시 이름",
      "맞춤 측정항목",
    ],
    answer: 3,
    explanation:
      "시간이나 수량처럼 정량적인 값은 맞춤 측정항목으로 분석할 수 있습니다. 설정할 때 수집하는 값에 맞는 측정 단위도 선택합니다.",
    source: "https://support.google.com/analytics/answer/14239619?hl=ko",
  },
];

export const practiceQuestions: Question[] = originalPracticeQuestions.map(
  (question) => ({
    ...question,
    ...bilingual[question.slug],
  }),
);

function normalizeOption(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export const questions: Question[] = suppliedQuestions.map((row) => {
  const ko = koreanSummaries[row.id];
  if (!ko || !topics.includes(ko.topic as Topic))
    throw new Error(`Missing GA4 translation for ${row.id}`);
  const verification = answerVerifications[row.id];
  const options = verification?.options ?? row.options;
  const answer =
    verification?.answer ??
    options.findIndex(
      (option) =>
        normalizeOption(option) === normalizeOption(row.correctAnswer),
    );
  return {
    slug: `exam-${String(row.id).padStart(3, "0")}`,
    sourceId: row.id,
    topic: ko.topic as Exclude<Topic, "전체">,
    title: ko.title,
    titleEn: row.question.replace(/\s*\(URL 제목 추출\)\s*$/, ""),
    sourceQuestion: row.question,
    options,
    answer,
    correctAnswer: row.correctAnswer,
    answerEn: row.correctAnswer,
    answerKo: ko.answer,
    explanation: "",
    source: row.url,
    reviewStatus: row.status,
    reviewNote: row.note,
    urlDerivedTitle: row.question.includes("URL 제목 추출"),
    answerVerification: verification
      ? `${verification.checkedAt} 원문 대조: ${verification.note}`
      : undefined,
  };
});
