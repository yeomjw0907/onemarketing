import type { RecordData } from "./types";

// Keep the approved text intact: the blog Markdown cleaner strips leading #tags.
export function clipDescription(raw: string) {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  const length = Array.from(text).length;
  const hashtags = [...text.matchAll(/#[\p{L}\p{N}_]+/gu)].map((m) => m[0]);
  const errors: string[] = [];
  if (length < 10 || length > 300)
    errors.push(`클립 설명은 10~300자여야 합니다. 현재 ${length}자입니다.`);
  if (hashtags.length > 5)
    errors.push(
      `클립 해시태그는 최대 5개입니다. 현재 ${hashtags.length}개입니다.`,
    );
  return { text, length, hashtags, errors, valid: errors.length === 0 };
}
export function requireClipDescription(raw: string) {
  const result = clipDescription(raw);
  if (!result.valid) throw new Error(result.errors.join(" "));
  return result.text;
}
export function requireClipMaterials(assets: RecordData[]) {
  if (!assets.some((a) => a.category === "video"))
    throw new Error("클립 영상과 설명 원고를 함께 등록하고 승인하세요.");
  const copies = assets.filter((a) => a.category === "copy");
  if (copies.length !== 1)
    throw new Error("클립 설명 원고는 최신본 1개를 등록하고 승인하세요.");
  return requireClipDescription(String(copies[0].text || ""));
}
export function clipCopyOutput(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  if (!cleaned.startsWith("{"))
    return { text: requireClipDescription(cleaned), notes: "" };
  const parsed = JSON.parse(cleaned);
  if (
    typeof parsed.description !== "string" ||
    (parsed.productionNotes !== undefined &&
      typeof parsed.productionNotes !== "string")
  )
    throw new Error(
      "클립 설명 생성 형식을 확인하세요. description과 productionNotes를 분리해주세요.",
    );
  return {
    text: requireClipDescription(parsed.description),
    notes: String(parsed.productionNotes || "").slice(0, 10000),
  };
}
