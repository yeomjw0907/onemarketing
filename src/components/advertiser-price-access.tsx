"use client";
import { useEffect, useState, type ReactNode } from "react";
import ProductOverview from "./service-overview";

// The server checks the session before rendering children. Recheck when a tab
// returns to the foreground so an expired or signed-out account loses the view.
export default function AdvertiserPriceAccess({
  children,
}: {
  children: ReactNode;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(true);
  useEffect(() => {
    let active = true;
    let serial = 0;
    const refresh = async () => {
      const current = ++serial;
      setAllowed(null);
      try {
        const response = await fetch("/api/viewer", { cache: "no-store" });
        const viewer = response.ok ? await response.json() : null;
        if (active && current === serial) setAllowed(!!viewer?.advertiser);
      } catch {
        if (active && current === serial) setAllowed(false);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("om-auth-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("om-auth-change", refresh);
    };
  }, []);
  if (allowed === false) return <ProductOverview />;
  return (
    <>
      {allowed === null && (
        <p role="status" style={{ padding: 32 }}>
          광고주 계정을 확인하고 있어요.
        </p>
      )}
      <div hidden={allowed === null}>{children}</div>
    </>
  );
}
