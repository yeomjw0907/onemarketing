"use client";
import { useEffect, useRef, useState } from "react";
export default function useAccountFavorites() {
  const [ids, setIds] = useState<string[]>([]),
    [owner, setOwner] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [legacy, setLegacy] = useState<string[]>([]);
  const current = useRef<string | null>(null),
    active = useRef(true),
    writing = useRef(false),
    serial = useRef(0);
  async function load() {
    const request = ++serial.current;
    try {
      const r = await fetch("/api/account-state?section=favorites", {
          cache: "no-store",
        }),
        d = await r.json();
      if (!active.current || request !== serial.current) return;
      if (r.status === 401) {
        current.current = null;
        setOwner(null);
        setIds([]);
        setLegacy([]);
        setReady(true);
        return;
      }
      if (!r.ok) throw Error(d.error);
      current.current = d.owner;
      setOwner(d.owner);
      setIds(d.state.ids);
      setReady(true);
      setError("");
      try {
        const old = JSON.parse(
          localStorage.getItem("om_saved_campaigns") || "[]",
        );
        if (Array.isArray(old))
          setLegacy(
            old.filter(
              (id: any) =>
                typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id),
            ),
          );
      } catch {}
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : "관심 캠페인을 불러오지 못했어요.",
        );
    }
  }
  useEffect(() => {
    active.current = true;
    void load();
    const refresh = () => {
      if (!writing.current) void load();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("om-auth-change", refresh);
    return () => {
      active.current = false;
      serial.current++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("om-auth-change", refresh);
    };
  }, []);
  async function mutate(body: Record<string, unknown>) {
    if (writing.current) return false;
    if (!current.current) {
      setError("로그인 후 관심 캠페인을 저장해주세요.");
      return false;
    }
    serial.current++;
    writing.current = true;
    setBusy(true);
    setError("");
    const expected = current.current;
    try {
      const r = await fetch("/api/account-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, owner: expected }),
        }),
        d = await r.json();
      if (r.status === 401) {
        await load();
        throw Error(d.error);
      }
      if (!r.ok) throw Error(d.error);
      if (current.current !== expected || d.owner !== expected) {
        await load();
        return false;
      }
      setIds(d.state.ids);
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "관심 캠페인을 저장하지 못했어요.",
      );
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  return {
    ids,
    owner,
    ready,
    busy,
    error,
    legacy,
    refresh: load,
    toggle: (id: string, saved: boolean) =>
      mutate({ action: "favorite", id, saved }),
    importLegacy: async () => {
      const ok = await mutate({
        action: "import-favorites",
        ids: legacy.slice(0, 500),
      });
      if (ok) {
        setLegacy([]);
        try {
          localStorage.removeItem("om_saved_campaigns");
        } catch {}
      }
    },
    dismissLegacy: () => {
      setLegacy([]);
      try {
        localStorage.removeItem("om_saved_campaigns");
      } catch {}
    },
  };
}
