export function loginEntryRole(
  role: string | undefined,
  signup: string | undefined,
  next: string,
): "advertiser" | "participant" {
  if (role === "participant" || role === "advertiser") return role;
  if (signup === "1" || next === "/marketing") return "advertiser";
  return next.startsWith("/campaigns/") ? "participant" : "advertiser";
}
