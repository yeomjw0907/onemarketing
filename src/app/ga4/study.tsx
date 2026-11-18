"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import BrandOrb from "@/components/brand-orb";
import {
  getAnswer,
  questions,
  topics,
  type Question,
  type Topic,
} from "./questions";
import { createQuestionSearch, normalizeSearch } from "./search";
import s from "./study.module.css";

const storageKey = "onemarketing.ga4.bookmarks.v1";
const searchQuestions = createQuestionSearch(questions);

function ReviewNotice({ question }: { question: Question }) {
  const notes: string[] = [];
  if (question.answerVerification) notes.push(question.answerVerification);
  else if (question.reviewStatus && question.reviewStatus !== "정상 (Verified)")
    notes.push(question.reviewStatus + ". " + (question.reviewNote || ""));
  if (question.answer < 0)
    notes.push(
      "정답 원문과 보기의 표현이 달라 정답 번호를 확정하지 않았습니다.",
    );
  if (question.options.some((option) => !option))
    notes.push("제공 자료에 일부 보기가 누락되어 있습니다.");
  return notes.length ? (
    <details className={s.reviewNotice}>
      <summary>
        {question.answerVerification
          ? "원문 대조 완료 · 확인 메모"
          : "자료 확인이 필요한 문제입니다"}
      </summary>
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </details>
  ) : null;
}

function QuestionCard({
  question,
  exact,
  saved,
  toggle,
}: {
  question: Question;
  exact?: boolean;
  saved: boolean;
  toggle: () => void;
}) {
  return (
    <article className={s.question} id={question.slug}>
      <div className={s.questionMeta}>
        <span className={s.questionId}>
          Q.
          {String(
            question.sourceId ?? questions.indexOf(question) + 1,
          ).padStart(3, "0")}
        </span>
        <span className={s.topic}>{question.topic}</span>
        {exact && <span className={s.exact}>질문 일치</span>}
        <button
          type="button"
          className={s.save}
          onClick={toggle}
          aria-pressed={saved}
          aria-label={question.title + " 북마크 " + (saved ? "해제" : "추가")}
        >
          <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <h3>
        <Link href={"/ga4/" + question.slug}>{question.title}</Link>
      </h3>
      {question.titleEn && (
        <p className={s.englishQuestion} lang="en">
          {question.titleEn}
        </p>
      )}
      <ol className={s.options} aria-label="보기">
        {question.options.map((option, i) =>
          option ? (
            <li key={i} value={i + 1} data-correct={i === question.answer}>
              <span className={s.optionNumber}>{i + 1}</span>
              <span className={s.optionText} lang="en">
                {option}
              </span>
              {i === question.answer && (
                <span className={s.correctLabel}>
                  <Check size={14} />
                  정답
                </span>
              )}
            </li>
          ) : null,
        )}
      </ol>
      <div className={s.directAnswer}>
        <div className={s.answerHeading}>
          <CheckCircle2 size={19} />
          <strong>
            {question.answer >= 0
              ? "정답은 " + (question.answer + 1) + "번입니다."
              : "정답 번호 확인이 필요합니다."}
          </strong>
        </div>
        <p className={s.answerKorean}>
          {question.answerKo || getAnswer(question)}
        </p>
        {question.answerKo && (
          <p className={s.answerOriginal} lang="en">
            {getAnswer(question)}
          </p>
        )}
      </div>
      <ReviewNotice question={question} />
      <div className={s.answerRow}>
        {question.urlDerivedTitle ? (
          <details className={s.sourceNote}>
            <summary>원문 안내</summary>
            <p>
              제공 자료에서 URL로 복원한 영어 제목입니다. 한국어 질문은 검색용
              요약입니다.
            </p>
          </details>
        ) : (
          <span className={s.sourceNote}>한국어 요약 · 영어 원문</span>
        )}
      </div>
    </article>
  );
}

export default function Ga4Study({
  initialQuestion,
}: {
  initialQuestion?: Question;
}) {
  const [topic, setTopic] = useState<Topic>("전체");
  const [query, setQuery] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [pagination, setPagination] = useState({ key: "", limit: 20 });
  useEffect(() => {
    const filters = new URLSearchParams(window.location.search);
    setOnlySaved(filters.get("saved") === "1");
    const requestedTopic = filters.get("topic");
    if (topics.some((t) => t === requestedTopic))
      setTopic(requestedTopic as Topic);
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) || "[]",
      );
      if (Array.isArray(value))
        setSaved(
          value.filter(
            (v): v is string =>
              typeof v === "string" && questions.some((q) => q.slug === v),
          ),
        );
    } catch {
      setStorageUnavailable(true);
    }
  }, []);
  function toggle(slug: string) {
    const next = saved.includes(slug)
      ? saved.filter((v) => v !== slug)
      : [...saved, slug];
    setSaved(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setStorageUnavailable(true);
    }
  }
  function selectTopic(value: Topic) {
    if (initialQuestion) {
      window.location.href =
        "/ga4?topic=" + encodeURIComponent(value) + "#questions";
      return;
    }
    setTopic(value);
    setOnlySaved(false);
  }
  function selectBookmarks() {
    if (initialQuestion) {
      window.location.href = "/ga4?saved=1#questions";
      return;
    }
    setOnlySaved((value) => !value);
  }
  const isSearching = normalizeSearch(query).length > 0 && !initialQuestion;
  const matches = initialQuestion
    ? [{ question: initialQuestion, exact: false, score: 0 }]
    : searchQuestions(
        query,
        (question) =>
          (topic === "전체" || question.topic === topic) &&
          (!onlySaved || saved.includes(question.slug)),
      );
  const viewKey = JSON.stringify([
    query,
    topic,
    onlySaved,
    onlySaved ? saved : [],
  ]);
  const displayLimit = pagination.key === viewKey ? pagination.limit : 20;

  return (
    <div className={s.root}>
      <a className={s.skip} href="#questions">
        문제로 바로가기
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link href="/ga4" className={s.brand}>
            <BrandOrb active size={20} />
            원마케팅 <span>GA4</span>
          </Link>
          <nav aria-label="학습 메뉴">
            <Link href="/ga4">전체 문제</Link>
            <a
              href="https://support.google.com/analytics/?hl=ko"
              target="_blank"
              rel="noreferrer"
            >
              공식 가이드 <ArrowUpRight size={14} />
            </a>
          </nav>
        </div>
      </header>
      <main className={s.main}>
        <div className={s.intro}>
          {initialQuestion ? (
            <>
              <Link className={s.back} href="/ga4">
                ← 전체 문제로 돌아가기
              </Link>
              <h1>GA4 문제와 정답</h1>
            </>
          ) : (
            <>
              <div className={s.titleRow}>
                <h1>GA4 문제 검색</h1>
                <span>{questions.length}문제</span>
              </div>
              <p>질문을 검색하면 보기와 정답을 바로 확인할 수 있어요.</p>
              <div className={s.search}>
                <Search size={21} />
                <input
                  aria-label="문제 검색"
                  placeholder="영어 또는 한국어 질문을 입력하세요"
                  value={query}
                  maxLength={4000}
                  autoComplete="off"
                  enterKeyHint="search"
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="검색 지우기"
                    onClick={() => setQuery("")}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <div className={s.body} id="questions">
          <aside className={s.sidebar}>
            <h2>문제 모아보기</h2>
            {topics.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={!onlySaved && topic === value && !initialQuestion}
                onClick={() => selectTopic(value)}
              >
                <span>
                  {value === "전체" && <BookOpen size={16} />}
                  {value === "전체" ? "전체 문제" : value}
                </span>
                <small>
                  {value === "전체"
                    ? questions.length
                    : questions.filter((q) => q.topic === value).length}
                </small>
              </button>
            ))}
            <div className={s.divider} />
            <button
              type="button"
              aria-pressed={onlySaved}
              onClick={selectBookmarks}
            >
              <span>
                <Bookmark size={16} />
                북마크
              </span>
              <small>{saved.length}</small>
            </button>
          </aside>
          <section className={s.collection} aria-label="문제와 정답 목록">
            {!initialQuestion && (
              <div className={s.mobileTopics}>
                {topics.map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={topic === value && !onlySaved}
                    onClick={() => selectTopic(value)}
                  >
                    {value}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={onlySaved}
                  onClick={selectBookmarks}
                >
                  북마크 {saved.length}
                </button>
              </div>
            )}
            <div className={s.collectionTitle}>
              <h2>
                {initialQuestion
                  ? initialQuestion.topic
                  : onlySaved
                    ? "북마크한 문제"
                    : isSearching
                      ? "검색 결과"
                      : topic === "전체"
                        ? "전체 문제"
                        : topic}
                <span>{matches.length}</span>
              </h2>
              {isSearching && <span>관련도순</span>}
            </div>
            {storageUnavailable && (
              <p className={s.storageNote}>
                북마크를 저장할 수 없어 현재 페이지에서만 유지됩니다.
              </p>
            )}
            <p className={s.resultCount} role="status">
              {isSearching
                ? matches.length + "개의 검색 결과 · 정답을 바로 표시합니다."
                : "전체 " + matches.length + "문제 · 정답을 바로 표시합니다."}
            </p>
            {matches.slice(0, displayLimit).map(({ question, exact }) => (
              <QuestionCard
                key={question.slug}
                question={question}
                exact={isSearching && exact}
                saved={saved.includes(question.slug)}
                toggle={() => toggle(question.slug)}
              />
            ))}
            {!initialQuestion && matches.length > displayLimit && (
              <button
                type="button"
                className={s.loadMore}
                onClick={() =>
                  setPagination({ key: viewKey, limit: displayLimit + 20 })
                }
              >
                문제 더 보기 ({displayLimit} / {matches.length})
              </button>
            )}
            {matches.length === 0 && (
              <div className={s.empty}>
                <Search size={28} />
                <h3>
                  {onlySaved ? "북마크한 문제가 없어요" : "검색 결과가 없어요"}
                </h3>
                <p>
                  {onlySaved
                    ? "문제의 책갈피를 눌러 저장해 보세요."
                    : "핵심 단어로 다시 검색하거나 주제 필터를 해제해 보세요."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setTopic("전체");
                    setOnlySaved(false);
                  }}
                >
                  전체 문제 보기
                </button>
              </div>
            )}
            {initialQuestion && (
              <Link className={s.more} href="/ga4">
                다른 문제 보기 <ChevronRight size={16} />
              </Link>
            )}
          </section>
        </div>
      </main>
      <footer className={s.footer}>
        <span>
          원마케팅 <b>GA4 문제은행</b>
        </span>
        <p>
          제공 자료에 기반한 독립 학습 페이지입니다. Google의 공식 인증 서비스가
          아닙니다.
        </p>
      </footer>
    </div>
  );
}
