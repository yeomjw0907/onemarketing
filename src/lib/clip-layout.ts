export const CLIP_TEMPLATE = {
  width: 720,
  height: 1280,
  titleY: 140,
  captionY: 890,
  version: 1,
} as const;

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
