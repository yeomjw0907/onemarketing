// Parallel wording for the original practice dataset. Future supplied records can
// put these fields directly on each Question instead.
export const bilingual: Record<
  string,
  { titleEn: string; answerEn: string; searchTerms?: string[] }
> = {
  "event-model": {
    titleEn:
      "How does GA4 collect user interactions such as page views and button clicks?",
    answerEn: "Events",
    searchTerms: ["event based data model", "이벤트 기반 모델"],
  },
  "enhanced-measurement": {
    titleEn:
      "Which feature measures scrolls and outbound link clicks on a website without writing additional code?",
    answerEn: "Enhanced measurement",
    searchTerms: ["automatic tracking", "자동 측정", "코드 없이"],
  },
  "event-parameters": {
    titleEn:
      "What sends additional information such as the URL of a clicked link along with an event?",
    answerEn: "Event parameters",
    searchTerms: ["link_url", "parameter", "추가 정보"],
  },
  "video-events": {
    titleEn:
      "Which videos can enhanced measurement collect video engagement events for?",
    answerEn: "Embedded YouTube videos with JavaScript API support",
    searchTerms: [
      "video_start",
      "video_progress",
      "video_complete",
      "영상 추적",
    ],
  },
  "realtime-window": {
    titleEn:
      "What time period does the active users in the last 30 minutes card in the Realtime report show?",
    answerEn: "The most recent 30 minutes",
    searchTerms: ["real time window", "실시간 시간 범위"],
  },
  "verify-event": {
    titleEn:
      "Which card can you use to quickly verify that a newly installed event has recently been collected?",
    answerEn: "Event count by Event name in the Realtime report",
    searchTerms: ["check event collection", "수집 확인", "이벤트 테스트"],
  },
  "key-event": {
    titleEn:
      "How can you identify an action that is especially important to your business, such as completing an enquiry?",
    answerEn: "Mark the event as a key event",
    searchTerms: [
      "conversion",
      "conversions",
      "전환",
      "비즈니스 목표",
      "핵심 이벤트",
    ],
  },
  "realtime-purpose": {
    titleEn: "When is the Realtime report most useful?",
    answerEn: "Checking visits and events for content you have just published",
    searchTerms: ["monitor new content", "게시 직후", "실시간 보고서 활용"],
  },
  "custom-dimension": {
    titleEn:
      "Which custom definition should you create to analyze categorical data such as a clicked button name?",
    answerEn: "Custom dimension",
    searchTerms: ["categorical", "범주형", "텍스트 값"],
  },
  "custom-data-flow": {
    titleEn:
      "How can you analyze a custom event parameter in standard reports?",
    answerEn: "Send the parameter and create a corresponding custom definition",
    searchTerms: ["register parameter", "매개변수 등록", "맞춤 정의"],
  },
  "custom-processing": {
    titleEn:
      "How long can it take before a new custom dimension or metric becomes available for reporting?",
    answerEn: "24 to 48 hours",
    searchTerms: [
      "24-48 hours",
      "processing delay",
      "처리 시간",
      "맞춤 측정기준 대기 시간",
    ],
  },
  "numeric-metric": {
    titleEn:
      "Which custom definition is appropriate for numerical data such as reading time in seconds?",
    answerEn: "Custom metric",
    searchTerms: ["quantitative", "숫자 데이터", "정량 데이터", "측정 단위"],
  },
};
