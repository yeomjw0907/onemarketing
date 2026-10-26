import Link from "next/link";
import type { ReactNode } from "react";
import PublicShell from "./public-shell";
import BrandVisual from "./brand-visual";
type Section = { id: string; title: string; content: ReactNode };
export default function DocumentationShell({
  title,
  description,
  sections,
  ai = false,
}: {
  title: string;
  description: string;
  sections: Section[];
  ai?: boolean;
}) {
  return (
    <PublicShell>
      <div className="documentation">
        <div className="docs-layout">
          <nav className="docs-sidebar" aria-label="가이드 메뉴">
            <p>원마케팅 가이드</p>
            <Link href="/guide" aria-current={!ai ? "page" : undefined}>
              이용 가이드
            </Link>
            <Link href="/ai" aria-current={ai ? "page" : undefined}>
              AI·MCP
            </Link>
            <hr />
            {sections.map((s) => (
              <a href={"#" + s.id} key={s.id}>
                {s.title}
              </a>
            ))}
            <hr />
            <Link href="/policy">이용·환불 안내</Link>
            <Link href="/participants/guide">게시 방법 안내</Link>
          </nav>
          <article className="docs-body">
            <div className="docs-breadcrumb">
              가이드　/　{ai ? "AI·MCP" : "서비스 이용"}
            </div>
            <div className="docs-brand-heading">
              <div>
                <h1>{title}</h1>
                <p className="docs-intro">{description}</p>
              </div>
              {ai && <BrandVisual kind="ai" size="inline" priority />}
            </div>
            {sections.map((s) => (
              <section id={s.id} key={s.id}>
                <h2>{s.title}</h2>
                {s.content}
              </section>
            ))}
          </article>
        </div>
      </div>
    </PublicShell>
  );
}
