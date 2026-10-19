import type { OrbState } from "thinking-orbs";
export function runningOrbState(
  job: { status?: unknown; type?: unknown } | undefined,
  stage?: unknown,
): OrbState | null {
  if (job?.status !== "running") return null;
  if (
    job.type === "copy" &&
    ["copy_verify", "copy_reverify"].includes(String(stage))
  )
    return "solving";
  switch (job.type) {
    case "research":
    case "product-review":
      return "searching";
    case "copy":
    case "scenario":
    case "media-plan":
      return "composing";
    case "image":
    case "video":
    case "slideshow":
      return "shaping";
    default:
      return "working";
  }
}
