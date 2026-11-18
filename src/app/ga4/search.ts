import type { Question } from "./questions";
import { getAnswer } from "./questions";

// Local bilingual terminology, not machine translation. Both question languages
// are indexed so pasted source questions do not depend on this vocabulary.
const concepts = [
  ["bigquery", "빅쿼리", "빅 쿼리"],
  ["firebase", "파이어베이스"],
  ["google ads", "구글 애즈", "구글애즈", "구글 광고"],
  ["search console", "서치콘솔", "서치 콘솔", "검색 콘솔"],
  ["measurement protocol", "측정 프로토콜", "측정프로토콜"],
  ["data import", "데이터 가져오기", "데이터가져오기"],
  ["data retention", "데이터 보관", "데이터보관", "데이터 보존"],
  ["user id", "사용자 id", "사용자 아이디", "유저 아이디"],
  ["funnel exploration", "유입경로 탐색", "퍼널 탐색", "퍼널탐색"],
  ["path exploration", "경로 탐색", "경로탐색"],
  ["free form", "자유 형식", "자유형식"],
  ["attribution", "기여 분석", "기여분석", "어트리뷰션"],
  [
    "audience trigger",
    "audience triggers",
    "잠재고객 트리거",
    "잠재고객트리거",
  ],
  ["audience", "audiences", "잠재고객", "오디언스"],
  ["dimension", "dimensions", "측정기준", "차원"],
  ["metric", "metrics", "측정항목", "측정 항목", "지표"],
  ["property", "properties", "속성"],
  ["collection", "collections", "컬렉션"],
  ["secondary dimension", "보조 측정기준", "보조측정기준"],
  ["data stream", "data streams", "데이터 스트림", "데이터스트림"],
  ["enhanced measurement", "향상된 측정", "향상된측정"],
  [
    "custom dimension",
    "custom dimensions",
    "맞춤 측정기준",
    "맞춤측정기준",
    "사용자 정의 차원",
  ],
  [
    "custom metric",
    "custom metrics",
    "맞춤 측정항목",
    "맞춤측정항목",
    "사용자 정의 지표",
  ],
  [
    "event parameter",
    "event parameters",
    "이벤트 매개변수",
    "이벤트매개변수",
    "파라미터",
  ],
  [
    "key event",
    "key events",
    "conversion",
    "conversions",
    "주요 이벤트",
    "주요이벤트",
    "전환",
    "핵심 이벤트",
  ],
  ["real time", "realtime", "실시간"],
  ["outbound", "external link", "외부 링크", "외부링크"],
  ["scroll", "scrolls", "scrolling", "스크롤"],
  ["video", "videos", "동영상", "영상"],
  ["button", "buttons", "버튼"],
  ["click", "clicks", "clicked", "클릭"],
  ["page view", "page views", "페이지 조회", "페이지조회"],
  ["active users", "active user", "활성 사용자", "활성사용자"],
  ["report", "reports", "reporting", "보고서", "리포트"],
  ["event", "events", "이벤트"],
  ["collect", "collected", "collection", "수집"],
  ["verify", "check", "확인", "검증", "테스트"],
  ["categorical", "category", "범주형", "범주"],
  ["numeric", "numerical", "quantitative", "숫자", "정량", "수치"],
  ["additional", "extra", "추가"],
  ["code", "coding", "코드", "코딩"],
  ["time", "period", "시간", "기간"],
  ["minutes", "minute", "분"],
  ["hours", "hour", "시간대기"],
  ["youtube", "유튜브"],
  ["website", "websites", "site", "웹사이트", "사이트"],
];

const stopWords = new Set(
  "a an the is are was were be been to of for in on at by with without which what how when can could would should you your do does that this it as and or from have has ga4 google analytics use using data create creates make makes following describe describes 어떤 무엇 무엇으로 어떻게 가장 같은 같은지 있는 없는 합니다 할까요 할 수 있나요 무엇인가요 무엇일까요 알려줘 데이터 만드는 만들기 방법 것이 기능 기능을".split(
    " ",
  ),
);

export function normalizeSearch(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const aliases = concepts
  .flatMap((group, i) =>
    group.map((alias) => ({
      alias: normalizeSearch(alias),
      token: `concept${i}`,
    })),
  )
  .sort((a, b) => b.alias.length - a.alias.length);
const aliasPattern = new RegExp(
  aliases
    .map(({ alias }) => (/[a-z]/.test(alias) ? `\\b${alias}\\b` : alias))
    .join("|"),
  "gu",
);
const conceptForAlias = new Map(
  aliases.map(({ alias, token }) => [alias, token]),
);

function terms(text: string): string[] {
  // Preserve multi-word concepts alongside original tokens for phrase matching
  // across languages and spelling tolerance within the source language.
  const normalized = normalizeSearch(text);
  const expanded = normalized.replace(
    aliasPattern,
    (alias) => ` ${conceptForAlias.get(alias)} `,
  );
  return [
    ...new Set(
      `${expanded} ${normalized}`
        .split(/\s+/)
        .filter((token) => !stopWords.has(token))
        .map((token) =>
          token.replace(
            /(에서는|에서|으로|에는|까지|처럼|이란|이랑|하면|하는|은|는|을|를|이|가|에|의|과|와|로)$/u,
            "",
          ),
        )
        .filter((token) => token.length > 1 && !stopWords.has(token)),
    ),
  ];
}

function isSmallTypo(a: string, b: string) {
  if (
    !/^[a-z]{5,}$/.test(a) ||
    !/^[a-z]{5,}$/.test(b) ||
    a.startsWith("concept") ||
    b.startsWith("concept") ||
    Math.abs(a.length - b.length) > 1
  )
    return false;
  let left = 0,
    right = 0,
    errors = 0;
  while (left < a.length && right < b.length) {
    if (a[left] === b[right]) {
      left++;
      right++;
      continue;
    }
    if (++errors > 1) return false;
    if (a.length >= b.length) left++;
    if (b.length >= a.length) right++;
  }
  return errors + (a.length - left) + (b.length - right) <= 1;
}

export function createQuestionSearch(questions: readonly Question[]) {
  const entries = questions.map((question) => ({
    question,
    titles: [question.title, question.titleEn || ""].map(normalizeSearch),
    answers: [
      getAnswer(question),
      question.answerKo || "",
      question.answerEn || "",
    ].map(normalizeSearch),
    primary: terms(
      [
        question.title,
        question.titleEn,
        getAnswer(question),
        question.answerKo,
        question.answerEn,
        ...(question.searchTerms || []),
      ].join(" "),
    ),
    secondary: terms(
      [
        getAnswer(question),
        question.answerKo,
        question.answerEn,
        question.explanation,
      ].join(" "),
    ),
  }));
  const frequency = new Map<string, number>();
  for (const entry of entries)
    for (const term of new Set([...entry.primary, ...entry.secondary]))
      frequency.set(term, (frequency.get(term) || 0) + 1);

  return (
    query: string,
    include: (question: Question) => boolean = () => true,
  ): { question: Question; score: number; exact: boolean }[] => {
    const normalized = normalizeSearch(query).slice(0, 4000);
    if (!normalized)
      return entries
        .filter(({ question }) => include(question))
        .map(({ question }) => ({
          question,
          score: 0,
          exact: false,
        }));
    const queryTerms = terms(normalized);
    const ranked = entries
      .filter(({ question }) => include(question))
      .map((entry) => {
        const exact = entry.titles.some(
          (title) => title.length > 0 && title === normalized,
        );
        const phrase =
          normalized.length >= 3 &&
          entry.titles.some((title) => title.includes(normalized));
        let score = exact ? 100 : phrase ? 18 : 0;
        if (entry.answers.includes(normalized)) score += 45;
        for (const term of queryTerms) {
          const weight =
            1 + Math.log(1 + entries.length / (frequency.get(term) || 1));
          if (entry.primary.includes(term)) score += weight * 3;
          else if (entry.secondary.includes(term)) score += weight;
          else if (
            !frequency.has(term) &&
            entry.primary.some((candidate) => isSmallTypo(term, candidate))
          )
            score += weight * 1.5;
        }
        return { question: entry.question, score, exact };
      })
      .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
    // Do not manufacture an answer when the indexed dataset has no match.
    const threshold = Math.max(2.5, (ranked[0]?.score || 0) * 0.35);
    return ranked.filter((entry) => entry.score >= threshold);
  };
}
