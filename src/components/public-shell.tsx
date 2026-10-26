"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef, type ReactNode } from "react";
import usePublicMotion from "./use-public-motion";
import BrandOrb from "./brand-orb";
import styles from "./platform.module.css";
export default function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  usePublicMotion(root, pathname);
  const [viewer, setViewer] = useState({
    admin: false,
    advertiser: false,
    participant: false,
  });
  useEffect(() => {
    let active = true;
    const refresh = () => {
      fetch("/api/viewer", { cache: "no-store" })
        .then((r) => r.json())
        .then((v) => {
          if (active) setViewer(v);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("om-auth-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("om-auth-change", refresh);
    };
  }, [pathname]);
  const nav = [
    ["/campaigns", "캠페인 찾기"],
    ["/marketing", "마케팅 상품"],
    ["/about", "서비스 소개"],
    ["/guide", "이용 가이드"],
    ["/ai", "AI·MCP"],
  ];
  return (
    <div ref={root} className={styles.root + " om-public-ui"}>
      <a href="#public-content" className={styles.skip}>
        본문 바로가기
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <BrandOrb active size={20} />
          원마케팅
        </Link>
        <nav aria-label="서비스 메뉴">
          {nav.map(([href, label]) => (
            <Link
              href={href}
              key={href}
              aria-current={
                (
                  href === "/campaigns"
                    ? pathname === "/" || pathname.startsWith(href)
                    : pathname.startsWith(href)
                )
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <nav aria-label="계정 메뉴">
          {viewer.admin ? <Link href="/admin/platform">운영 관리</Link> : null}
          {viewer.advertiser ? (
            <Link href="/advertisers">광고주 마이페이지</Link>
          ) : null}
          {viewer.participant ? (
            <Link href="/participants/portal">나의 활동</Link>
          ) : null}
          {!viewer.admin && !viewer.advertiser && !viewer.participant ? (
            <>
              <Link href="/login">로그인</Link>
              <Link href="/signup" className={styles.cta}>
                회원가입
              </Link>
            </>
          ) : null}
        </nav>
      </header>
      <main id="public-content">{children}</main>
      <footer className={styles.footer}>
        <div>
          <Link href="/">원마케팅</Link>
          <p>체험단 모집부터 게시물 확인까지</p>
        </div>
        <nav>
          <Link href="/about">서비스 소개</Link>
          <Link href="/policy">이용·환불 안내</Link>
          <Link href="/guide">이용 가이드</Link>
          <Link href="/ai">AI·MCP 문서</Link>
          <Link href="/admin">관리자</Link>
        </nav>
      </footer>
    </div>
  );
}
