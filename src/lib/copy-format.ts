import type { RecordData } from "./types";
export function orderedImages(assets: RecordData[], taskId: unknown) {
  const rows = assets.filter(
    (a) => a.taskId === taskId && a.category === "image",
  );
  const first = (a: RecordData) =>
    rows
      .filter((b) => (b.slot || b.id) === (a.slot || a.id))
      .map((b) => b.createdAt)
      .sort()[0] || a.createdAt;
  return rows
    .filter((a) => a.current === true)
    .sort(
      (a, b) => first(a).localeCompare(first(b)) || a.id.localeCompare(b.id),
    );
}
export function publishableCopy(raw: string) {
  let text = raw;
  const body = raw.match(
    /^##\s*2\.?\s*본문\s*\n([\s\S]*?)(?=^##\s*3\.?\s|$(?![\s\S]))/m,
  );
  if (body) {
    const title = raw.match(
      /^##\s*1\.?\s*제목\s*\n[\s\S]*?\*\*([^\n]+?)\*\*/m,
    )?.[1];
    text = (title ? title + "\n\n" : "") + body[1];
  }
  return text
    .replace(/^>\s*제작 메모[^\n]*(?:\n|$)/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*\*?\([^\n]*확인 필요 표현[^\n]*\)\*?\s*$/gm, "")
    .replace(/\[이미지\s*(\d+)[^\]\n]*\]/g, "[이미지 $1]")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^\n]+?)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^---+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function blogCopyOutput(raw: string, images: number) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  if (!cleaned.startsWith("{"))
    return { text: publishableCopy(raw), notes: "" };
  const parsed = JSON.parse(cleaned);
  if (
    typeof parsed.title !== "string" ||
    !parsed.title.trim() ||
    typeof parsed.body !== "string" ||
    !parsed.body.trim()
  )
    throw new Error("원고 제목·본문 형식을 확인하세요.");
  const text = publishableCopy(parsed.title + "\n\n" + parsed.body);
  const markers = [...text.matchAll(/\[이미지 (\d+)\]/g)].map((m) =>
    Number(m[1]),
  );
  if (markers.length !== images || markers.some((n, i) => n !== i + 1))
    throw new Error("원고의 이미지 삽입 위치·순서가 계약 수량과 다릅니다.");
  return {
    text,
    notes:
      typeof parsed.editorialNotes === "string"
        ? parsed.editorialNotes.slice(0, 10000)
        : "",
  };
}
