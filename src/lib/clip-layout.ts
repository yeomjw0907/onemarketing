export const CLIP_TEMPLATE = {
  width: 720,
  height: 1280,
  titleY: 140,
  captionY: 890,
  version: 2,
} as const;
export const TITLE_STYLES = [
  {
    id: "clean",
    label: "깔끔한 화이트",
    font: "NanumGothic",
    file: "NanumGothic-Regular.ttf",
    color: "#ffffff",
    size: 46,
    stroke: 2,
    motion: "none",
  },
  {
    id: "impact",
    label: "굵은 옐로",
    font: "NanumGothic Bold",
    file: "NanumGothic-Bold.ttf",
    color: "#ffe66d",
    size: 50,
    stroke: 3,
    motion: "fade",
  },
  {
    id: "editorial",
    label: "차분한 명조",
    font: "NanumMyeongjo",
    file: "NanumMyeongjo-Regular.ttf",
    color: "#fff4db",
    size: 46,
    stroke: 2,
    motion: "fade",
  },
  {
    id: "pop",
    label: "산뜻한 민트",
    font: "NanumGothic Bold",
    file: "NanumGothic-Bold.ttf",
    color: "#a0f5df",
    size: 48,
    stroke: 3,
    motion: "slide",
  },
] as const;
export type TitleStyleId = "auto" | (typeof TITLE_STYLES)[number]["id"];
export type TitleMotion = "auto" | "none" | "fade" | "slide";
export function resolveTitleStyle(id: TitleStyleId | undefined, seed: string) {
  let hash = 2166136261;
  for (const c of seed)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return (
    TITLE_STYLES.find((s) => s.id === id) ||
    TITLE_STYLES[hash % TITLE_STYLES.length]
  );
}

export function clipTitle(
  edit: { title?: string; hook?: string } | undefined,
  productName: unknown,
  taskName: unknown,
) {
  const explicit = edit?.title?.trim();
  if (explicit) return explicit;
  const hook = edit?.hook?.trim();
  return hook && [...hook].length <= 36
    ? hook
    : String(productName || taskName || "서비스 소개").slice(0, 36);
}

export type ClipLayout = "auto" | "split" | "overlay";
export type ClipEdit = {
  titleLead?: string;
  titleAccent?: string;
  layout?: ClipLayout;
  contentKind?: "service" | "product" | "story";
  accentColor?: "yellow" | "red" | "mint";
};
export function resolveClipLayout(edit?: ClipEdit): "split" | "overlay" {
  if (edit?.layout && edit.layout !== "auto") return edit.layout;
  return edit?.contentKind === "service" ? "split" : "overlay";
}
export const ACCENT_COLORS = {
  yellow: "#ffe600",
  red: "#ff5050",
  mint: "#a0f5df",
} as const;
