"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./platform.module.css";
export default function PublicShell({ children }: { children: ReactNode }) {
  const [advertiser, setAdvertiser] = useState(false);
  useEffect(() => {
    fetch("/api/advertiser-auth", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAdvertiser(!!d?.account))
      .catch(() => {});
  }, []);
  return (
    <div className={styles.root}>
      <a href="#public-content" className={styles.skip}>
        본문 바로가기
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          ONE<span>MARKETING</span>
        </Link>
        <nav aria-label="서비스 메뉴">
          <Link href="/campaigns">캠페인 찾기</Link>
          <Link href="/marketing">상품·가격</Link>
          <Link href="/ai">AI로 모집하기</Link>
        </nav>
        <nav aria-label="계정 메뉴">
          {advertiser ? (
            <Link href="/advertisers">광고주 마이페이지</Link>
          ) : (
            <>
              <Link href="/login">로그인</Link>
              <Link href="/signup" className={styles.cta}>
                회원가입
              </Link>
            </>
          )}
          <Link href="/participants/portal">나의 활동</Link>
        </nav>
      </header>
      <main id="public-content">{children}</main>
      <footer className={styles.footer}>
        <Link href="/">원마케팅</Link>
        <p>브랜드의 콘텐츠와 사람을 연결합니다.</p>
        <nav>
          <Link href="/policy">이용·환불 안내</Link>
          <Link href="/participants/guide">참여 안내</Link>
          <Link href="/admin">관리자</Link>
        </nav>
      </footer>
    </div>
  );
}
