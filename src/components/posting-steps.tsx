"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Feedback } from "./ui/workflow-ui";
import ClipPostingNotes from "./clip-posting-notes";
import NaverAppButton from "./naver-app-button";

type PostingFile = {
  id: string;
  name: string;
  category: string;
  text?: string;
  mime?: string;
  size?: number;
};

function SaveFile({ file, index }: { file: PostingFile; index: number }) {
  const [prepared, setPrepared] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(
    () =>
      setSharing(
        typeof navigator.share === "function" &&
          typeof navigator.canShare === "function",
      ),
    [],
  );
  const url = "/api/participant-portal/files/" + file.id;
  const image =
    file.category === "image" &&
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      file.mime || "",
    );
  async function prepare() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok)
        throw new Error(
          "파일을 불러오지 못했어요. 로그인과 자료 상태를 확인해주세요.",
        );
      const blob = await r.blob();
      if (blob.size > 25 * 1024 * 1024)
        throw new Error("큰 파일은 파일 저장을 이용해주세요.");
      const data = new File([blob], file.name, {
        type: blob.type || file.mime || "application/octet-stream",
      });
      if (!navigator.canShare({ files: [data] }))
        throw new Error(
          "이 파일은 저장·공유 메뉴를 지원하지 않아요. 파일 저장을 이용해주세요.",
        );
      setPrepared(data);
      setMessage(
        "준비됐어요. 저장·공유 메뉴를 열어 저장할 위치를 선택해주세요.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "파일 저장을 이용해주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!prepared) return;
    try {
      // A separate click preserves user activation on iOS after downloading bytes.
      await navigator.share({ files: [prepared] });
      setMessage(
        "저장·공유 메뉴를 닫았어요. 선택한 앱에서 저장됐는지 확인해주세요.",
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError")
        setMessage("저장·공유를 취소했어요.");
      else
        setMessage(
          "메뉴를 열지 못했어요. 파일 저장이나 이미지 열기를 이용해주세요.",
        );
    }
  }
  return (
    <div className="posting-file">
      {image && (
        <a
          href={url + "?preview=1"}
          target="_blank"
          rel="noreferrer"
          aria-label={`${index}. ${file.name} 이미지 열기`}
        >
          <img
            src={url + "?preview=1"}
            alt={`${index}. ${file.name}`}
            loading="lazy"
          />
        </a>
      )}
      <strong>
        {index}. {file.name}
      </strong>
      <div className="posting-actions">
        <a href={url} download={file.name}>
          파일 저장
        </a>
        {image && (
          <a href={url + "?preview=1"} target="_blank" rel="noreferrer">
            이미지 열기
          </a>
        )}
        {sharing &&
          (file.category === "image" || file.category === "video") &&
          Number(file.size || 0) <= 25 * 1024 * 1024 && (
            <Button
              disabled={busy}
              onClick={() => void (prepared ? share() : prepare())}
            >
              {busy
                ? "자료 준비 중…"
                : prepared
                  ? "저장·공유 메뉴 열기"
                  : "휴대폰 저장 준비"}
            </Button>
          )}
      </div>
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function CopyFile({ file }: { file: PostingFile }) {
  const [message, setMessage] = useState("");
  const text = useRef<HTMLTextAreaElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(file.text || "");
      setMessage("원고를 복사했어요. 네이버에서 붙여넣기 해주세요.");
    } catch {
      setMessage("자동 복사가 안 돼요. 선택된 원고를 길게 눌러 복사해주세요.");
      if (details.current) details.current.open = true;
      text.current?.focus();
      text.current?.select();
      text.current?.setSelectionRange(0, (file.text || "").length);
    }
  }
  return (
    <div className="posting-copy">
      <strong>{file.name}</strong>
      <Button
        disabled={!file.text}
        variant="primary"
        onClick={() => void copy()}
      >
        원고 전체 복사
      </Button>
      <details ref={details}>
        <summary>원고 확인 · 직접 복사</summary>
        <textarea
          ref={text}
          readOnly
          value={file.text || ""}
          aria-label={`${file.name} 원고`}
          rows={10}
        />
      </details>
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

export default function PostingSteps({
  files,
  channel,
}: {
  files: PostingFile[];
  channel: string;
}) {
  const media = files.filter((f) => f.category !== "copy");
  const copies = files.filter((f) => f.category === "copy");
  return (
    <ol className="posting-steps" aria-label="게시 준비 순서">
      <li>
        <h3>자료를 저장해주세요</h3>
        <p className="hint">
          자료를 아래 순서대로 저장해주세요. 블로그에는 같은 순서로 넣어주세요.
        </p>
        {!media.length && (
          <Feedback>
            전달된 이미지·영상이 없어요. 담당자에게 자료를 확인해주세요.
          </Feedback>
        )}
        <div className="posting-files">
          {media.map((f, i) => (
            <SaveFile key={f.id} file={f} index={i + 1} />
          ))}
        </div>
        <details>
          <summary>휴대폰에 저장하는 방법</summary>
          <p>
            아이폰은 저장·공유 메뉴에서 ‘이미지 저장’ 또는 ‘파일에 저장’을
            선택해주세요. 안드로이드는 다운로드 후 사진 앱이나 다운로드 폴더에서
            확인해주세요. 이미지 열기에서 사진을 길게 눌러 저장할 수도 있어요.
          </p>
          <p>
            브라우저에 따라 저장 방식이 달라요. 카카오톡 안에서 저장이 안 되면
            외부 브라우저로 이 화면을 열어주세요. 영상이나 큰 파일은 ‘파일
            저장’을 이용해주세요.
          </p>
        </details>
      </li>
      <li>
        <h3>
          {channel === "clip"
            ? "클립 설명을 복사해주세요"
            : "원고를 복사해주세요"}
        </h3>
        <p className="hint">
          {channel === "clip"
            ? "설명 본문은 10~300자로 준비해주세요. 광고 표시와 필수 문구를 유지하고 해시태그는 최대 5개까지 넣을 수 있어요."
            : "광고 표시와 필수 문구를 포함해 전체 원고를 복사해주세요. 이미지 위치 표시가 있다면 해당 위치에 이미지를 넣어주세요."}
        </p>
        {!copies.length && (
          <Feedback>
            {channel === "clip"
              ? "클립 설명 원고가 아직 전달되지 않았어요. 담당자에게 요청해주세요."
              : "전달된 원고가 없어요. 담당자에게 확인해주세요."}
          </Feedback>
        )}
        {copies.map((f) => (
          <CopyFile key={f.id} file={f} />
        ))}
      </li>
      <li>
        <h3>네이버에서 게시해주세요</h3>
        <p className="hint">
          {channel === "clip"
            ? "네이버 앱의 클립에서 저장한 영상을 선택하고 설명 원고를 붙여넣어주세요."
            : "블로그 글쓰기를 열고 원고를 붙여넣은 뒤 저장한 이미지를 순서대로 넣어주세요."}{" "}
          캠페인 가이드를 확인하고 전체 공개로 게시해주세요.
        </p>
        {channel === "clip" && <ClipPostingNotes />}
        <NaverAppButton channel={channel} />
      </li>
    </ol>
  );
}
