"use client";
import { useEffect, useState } from "react";
import { naverAppLinks } from "@/lib/naver-app-link";

export default function NaverAppButton({
  channel = "blog",
}: {
  channel?: string;
}) {
  const [agent, setAgent] = useState("");
  useEffect(() => setAgent(navigator.userAgent), []);
  const links = naverAppLinks(agent, channel);
  return (
    <div className="posting-app-actions">
      <a className="posting-main-link" href={links.app}>
        <img
          src="/brands/naver.ico"
          width={24}
          height={24}
          alt=""
          aria-hidden="true"
        />
        {links.mobile ? "네이버 앱 열기" : "네이버 웹 열기"}
      </a>
      {links.mobile && (
        <details className="posting-app-fallback">
          <summary>앱이 열리지 않나요?</summary>
          <p className="hint">
            앱이 열리지 않으면 웹으로 열거나 네이버 앱을 설치해주세요. 카카오톡
            안에서 열리지 않을 때는 외부 브라우저에서 다시 시도해주세요.
          </p>
          <div className="posting-actions">
            <a href={links.web} target="_blank" rel="noreferrer">
              웹으로 열기
            </a>
            <a href={links.install} target="_blank" rel="noreferrer">
              네이버 앱 설치
            </a>
          </div>
        </details>
      )}
      <p className="hint">
        배정된 계정으로 게시한 뒤 이 화면으로 돌아와주세요.
      </p>
    </div>
  );
}
