import { safeReturnPath } from "./campaign-display";

export function safeLoginReturnPath(value: unknown) {
  return (
    safeReturnPath(value) ||
    (typeof value === "string" &&
    /^\/advertisers(?:\?tab=(?:overview|orders|products))?$/.test(value)
      ? value
      : "")
  );
}

export function advertiserLoginPath(tab = "overview") {
  const next = safeLoginReturnPath(`/advertisers?tab=${tab}`) || "/advertisers";
  return `/login?role=advertiser&next=${encodeURIComponent(next)}`;
}

export function safeParticipantPortalReturn(value: unknown) {
  return typeof value === "string" &&
    /^\/participants\/portal(?:\?tab=(?:offers|tasks|availability|payments|applications))?$/.test(
      value,
    )
    ? value
    : "";
}

export function participantPortalReturn(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  if (pathname !== "/participants/portal")
    return safeParticipantPortalReturn(params.get("next"));
  const tab = params.get("tab");
  return (
    safeParticipantPortalReturn(`/participants/portal?tab=${tab}`) ||
    "/participants/portal"
  );
}

export function applyParticipantReturn(destination: URL, next: unknown) {
  const path = safeParticipantPortalReturn(next);
  if (!path) return;
  const target = new URL(path, destination);
  destination.pathname = target.pathname;
  destination.search = target.search;
}

export function applyAdvertiserReturn(destination: URL, next: unknown) {
  const path = safeLoginReturnPath(next);
  if (!path) return;
  const target = new URL(path, destination);
  destination.pathname = target.pathname;
  destination.search = target.search;
}

export function loginEntryRole(
  role: string | undefined,
  signup: string | undefined,
  next: string,
): "advertiser" | "participant" {
  if (role === "participant" || role === "advertiser") return role;
  if (signup === "1" || next === "/marketing") return "advertiser";
  return next.startsWith("/campaigns/") ? "participant" : "advertiser";
}
