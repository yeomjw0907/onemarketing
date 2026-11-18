import assert from "node:assert/strict";
import { test } from "node:test";
import {
  practiceQuestions as questions,
  questions as suppliedBank,
  getAnswer,
  type Question,
} from "../src/app/ga4/questions";
import sourceQuestions from "../src/app/ga4/data/source-questions.json";
import { createQuestionSearch } from "../src/app/ga4/search";

const search = createQuestionSearch(questions);

test("pasted questions in either language rank the original question first", () => {
  for (const question of questions) {
    for (const title of [question.title, question.titleEn!]) {
      const [match] = search(title.toUpperCase().replace(/\?/g, "？"));
      assert.equal(match?.question.slug, question.slug, title);
      assert.equal(match.exact, true);
    }
  }
});

test("bilingual terms and paraphrases retrieve the correct stored answers", () => {
  const examples = [
    ["enhanced measurement", "enhanced-measurement"],
    ["향상된측정", "enhanced-measurement"],
    ["스크롤 코드 없이", "enhanced-measurement"],
    ["enhanced measurment", "enhanced-measurement"],
    ["전환", "key-event"],
    ["conversion", "key-event"],
    ["What sends extra information with an event?", "event-parameters"],
    ["이벤트 수집 확인", "verify-event"],
    ["유튜브", "video-events"],
    ["YouTube", "video-events"],
    ["맞춤측정기준 처리 시간", "custom-processing"],
    [
      "How long does a custom dimension take to appear in reports?",
      "custom-processing",
    ],
    ["독서 시간 숫자 데이터", "numeric-metric"],
    ["custom metric", "numeric-metric"],
    ["categorical button name", "custom-dimension"],
    [
      "What time period does the real time report show active users?",
      "realtime-window",
    ],
  ];
  for (const [query, slug] of examples) {
    assert.equal(search(query)[0]?.question.slug, slug, query);
  }
});

test("empty input preserves the collection, unrelated input returns no invented answer", () => {
  assert.equal(search("  \n").length, questions.length);
  assert.equal(search("？！").length, questions.length);
  for (const query of [
    "pizza recipe",
    "asdfghjkl",
    "피자 만드는 방법",
    "<script>alert('xss')</script>",
  ]) {
    assert.deepEqual(search(query), [], query);
  }
});

test("incorrect options are not indexed as if they were the answer", () => {
  const question: Question = {
    slug: "sample",
    title: "테스트 질문",
    topic: "보고서",
    options: ["correctword", "wrongword"],
    answer: 0,
    explanation: "해설",
    source: "https://example.com",
  };
  const find = createQuestionSearch([question]);
  assert.equal(
    find("correctword")[0]?.question.options[question.answer],
    "correctword",
  );
  assert.deepEqual(find("wrongword"), []);
});

test("ranking threshold respects the active filter before selecting results", () => {
  const result = search(
    "enhanced measurement",
    (q) => q.slug === "video-events",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].question.slug, "video-events");
  assert.equal(search("", (q) => q.topic === "보고서").length, 4);
  assert.deepEqual(
    search("YouTube", (q) => q.topic === "맞춤 데이터"),
    [],
  );
});

test("new bilingual records are indexed without modifying the search engine", () => {
  const record: Question = {
    slug: "new-question",
    topic: "보고서",
    title: "어떤 도구에서 경로를 탐색하나요?",
    titleEn: "Which tool explores user paths?",
    options: ["경로 탐색", "기타"],
    answer: 0,
    answerEn: "Path exploration",
    searchTerms: ["journey", "사용자 여정"],
    explanation: "경로를 살펴보세요.",
    source: "https://example.com",
  };
  const find = createQuestionSearch([...questions, record]);
  for (const query of [
    record.title,
    record.titleEn!,
    "사용자 여정",
    "journey",
    "Path exploration",
  ]) {
    assert.equal(find(query)[0]?.question.slug, record.slug, query);
  }
});

test("239 supplied questions retain every original question, answer and option position", () => {
  assert.equal(suppliedBank.length, 239);
  assert.equal(new Set(suppliedBank.map((q) => q.slug)).size, 239);
  for (const row of sourceQuestions) {
    const question = suppliedBank.find((q) => q.sourceId === row.id)!;
    assert.ok(question, String(row.id));
    assert.equal(question.sourceQuestion, row.question);
    assert.equal(getAnswer(question), row.correctAnswer);
    assert.equal(question.source, row.url);
    assert.deepEqual(question.options, row.options);
    assert.match(question.title, /[가-힣]/);
    assert.ok(question.answerKo);
    assert.equal(question.reviewStatus, row.status);
    if (question.answer >= 0) {
      const normalize = (value: string) =>
        value
          .normalize("NFKC")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, "");
      assert.equal(
        normalize(question.options[question.answer]),
        normalize(row.correctAnswer),
      );
    }
  }
  assert.equal(suppliedBank.filter((q) => q.answer < 0).length, 6);
  assert.equal(suppliedBank.find((q) => q.sourceId === 59)!.answer, -1);
  assert.equal(
    suppliedBank.find((q) => q.sourceId === 104)!.reviewStatus,
    "주의/오류 의심 (Mismatch)",
  );
});

test("every supplied English question ranks an exact match first, including duplicate titles", () => {
  const find = createQuestionSearch(suppliedBank);
  for (const question of suppliedBank) {
    const [result] = find(question.titleEn!);
    assert.equal(result?.exact, true, question.slug);
    assert.equal(
      result.question.titleEn!.toLowerCase(),
      question.titleEn!.toLowerCase(),
      question.slug,
    );
    assert.ok(
      find(question.titleEn!).some((r) => r.question.slug === question.slug),
    );
  }
});

test("Korean questions and English keywords retrieve supplied answer types", () => {
  const find = createQuestionSearch(suppliedBank);
  const queries: [string, number[]][] = [
    ["웹사이트 앱 사용자 여정 분석", [1, 37, 234, 235, 236]],
    ["잠재고객 트리거", [237, 238, 239]],
    ["BigQuery 내보내기 빈도", [80, 81, 91]],
    ["빅쿼리 내보내기 빈도", [80, 81, 91]],
    ["파이어베이스 앱 데이터", [131, 132, 133]],
    ["자연 검색어 연결 플랫폼", [125, 126, 127]],
    ["속성 영구 삭제 며칠", [137, 138, 139]],
    ["실시간 보고서 30분", [240, 241, 242]],
    ["GA4 유니버설 애널리틱스 차이", [185, 186, 187]],
    ["보고서 왼쪽 메뉴 컬렉션", [41, 42, 43]],
  ];
  for (const [query, expected] of queries) {
    assert.ok(
      expected.includes(find(query)[0]?.question.sourceId || -1),
      `${query}: ${find(query)[0]?.question.slug}`,
    );
  }
  assert.deepEqual(find("피자 만드는 방법"), []);
});
