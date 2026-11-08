export const portalTabs = [
  "offers",
  "tasks",
  "availability",
  "payments",
  "applications",
] as const;
export function portalTab(value: string | null) {
  return portalTabs.find((tab) => tab === value) || "";
}

export function initialPortalTab(
  requested: string | null,
  pendingOffers: boolean,
  taskCount: number,
) {
  return (
    portalTab(requested) ||
    (pendingOffers ? "offers" : taskCount ? "tasks" : "applications")
  );
}
