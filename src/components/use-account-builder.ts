"use client";
import { useEffect, useRef, useState } from "react";
import {
  builderStateSchema,
  type BuilderState,
} from "@/lib/account-state-schema";
import { campaignQuote } from "@/lib/commerce-policy";
type State = BuilderState & { draft: NonNullable<BuilderState["draft"]> };
type Envelope = { owner: string; version: number; state: BuilderState };
const guestCart = "om_campaign_cart_v1",
  guestDraft = "om_campaign_draft_v2";
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "계정에 저장하지 못했어요.";
export default function useAccountBuilder(fresh: () => State) {
  const [value, setValue] = useState<State>(fresh),
    [ready, setReady] = useState(false),
    [owner, setOwner] = useState<string | null>(null),
    [status, setStatus] = useState("loading"),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState<Envelope | null>(null),
    [legacy, setLegacy] = useState<State | null>(null);
  const ownerRef = useRef<string | null>(null),
    version = useRef(0),
    baseline = useRef(""),
    current = useRef(value),
    pending = useRef<State | null>(null),
    blocked = useRef(false),
    saving = useRef<Promise<void> | null>(null),
    active = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    request = useRef<any>(null),
    generation = useRef(0),
    loadSerial = useRef(0);
  const normalize = (s: BuilderState): State => ({
    ...s,
    draft: s.draft || fresh().draft,
  });
  function apply(envelope: Envelope) {
    version.current = envelope.version;
    ownerRef.current = envelope.owner;
    setOwner(envelope.owner);
    const next = normalize(envelope.state);
    baseline.current = JSON.stringify(next);
    current.current = next;
    pending.current = null;
    setValue(next);
    blocked.current = false;
    setConflict(null);
    setStatus("saved");
    setError("");
  }
  function cache(state: State) {
    if (ownerRef.current)
      localStorage.setItem(
        "om_builder_pending:" + ownerRef.current,
        JSON.stringify({ version: version.current, state }),
      );
  }
  async function flush(): Promise<void> {
    if (saving.current) {
      await saving.current;
      if (pending.current && !blocked.current) return flush();
      return;
    }
    if (blocked.current)
      throw Error("다른 기기의 변경 내용을 먼저 확인해주세요.");
    if (!ownerRef.current || !pending.current) return;
    loadSerial.current++;
    const identity = ownerRef.current,
      epoch = generation.current;
    const work = (async () => {
      while (pending.current && epoch === generation.current) {
        const snapshot = pending.current,
          serialized = JSON.stringify(snapshot);
        setStatus("saving");
        const r = await fetch("/api/account-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save-builder",
            owner: identity,
            version: version.current,
            state: snapshot,
          }),
        });
        const d = await r.json();
        if (epoch !== generation.current) return;
        if (r.status === 401 && d.code === "account_changed") {
          await load(true);
          throw Error(d.error);
        }
        if (r.status === 409) {
          blocked.current = true;
          setConflict(d.current);
          setStatus("conflict");
          throw Error(d.error);
        }
        if (!r.ok) {
          setStatus("error");
          throw Error(d.error || "계정에 저장하지 못했어요.");
        }
        if (d.owner !== identity)
          throw Error(
            "로그인 계정이 변경됐어요. 계정 내용을 다시 불러와주세요.",
          );
        version.current = d.version;
        baseline.current = serialized;
        if (pending.current && JSON.stringify(pending.current) === serialized) {
          pending.current = null;
          try {
            localStorage.removeItem("om_builder_pending:" + identity);
          } catch {}
          setStatus("saved");
          setError("");
        } else if (pending.current) {
          try {
            cache(pending.current);
          } catch {}
        }
      }
    })();
    saving.current = work;
    try {
      await work;
    } catch (e) {
      if (active.current) {
        setError(errorMessage(e));
        if (!blocked.current) setStatus("error");
      }
      throw e;
    } finally {
      saving.current = null;
    }
  }
  function readGuest() {
    const base = fresh();
    try {
      const cart = JSON.parse(localStorage.getItem(guestCart) || "[]");
      if (Array.isArray(cart))
        base.cart = cart.slice(0, 10).map((x) => campaignQuote(x).input);
      const old = JSON.parse(localStorage.getItem(guestDraft) || "null");
      if (old?.draft) {
        const candidate = builderStateSchema.safeParse({
          ...base,
          ...old,
          cart: base.cart,
        });
        if (candidate.success) return normalize(candidate.data);
      }
    } catch {}
    return base;
  }
  async function load(force = false) {
    const sequence = ++loadSerial.current;
    if (force) {
      generation.current++;
      request.current = null;
    }
    const r = await fetch("/api/account-state?section=builder", {
      cache: "no-store",
    });
    if (!active.current || sequence !== loadSerial.current) return;
    if (r.status === 401) {
      if (force || ownerRef.current) {
        generation.current++;
        ownerRef.current = null;
        setOwner(null);
        pending.current = null;
        blocked.current = false;
        setConflict(null);
        const guest = readGuest();
        baseline.current = JSON.stringify(guest);
        current.current = guest;
        setValue(guest);
        setStatus("local");
        setError("");
      }
      setReady(true);
      return;
    }
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    if (
      !force &&
      d.owner === ownerRef.current &&
      (pending.current || saving.current || blocked.current)
    )
      return;
    if (!force && d.owner === ownerRef.current && d.version === version.current)
      return;
    if (d.owner !== ownerRef.current) {
      generation.current++;
      request.current = null;
    }
    apply(d);
    const guest = readGuest();
    if (guest.cart.length || guest.draft.title || guest.draft.guide)
      setLegacy(guest);
    try {
      const cached = JSON.parse(
        localStorage.getItem("om_builder_pending:" + d.owner) || "null",
      );
      const parsed = builderStateSchema.safeParse(cached?.state);
      if (
        parsed.success &&
        JSON.stringify(normalize(parsed.data)) === baseline.current
      )
        localStorage.removeItem("om_builder_pending:" + d.owner);
      if (
        parsed.success &&
        JSON.stringify(normalize(parsed.data)) !== baseline.current
      ) {
        const restored = normalize(parsed.data);
        pending.current = restored;
        current.current = restored;
        setValue(restored);
        if (cached.version !== d.version) {
          blocked.current = true;
          setConflict(d);
          setStatus("conflict");
        } else setStatus("pending");
      }
    } catch {}
    setReady(true);
  }
  useEffect(() => {
    active.current = true;
    load(true).catch((e) => {
      if (active.current) {
        setError(errorMessage(e));
        setStatus("error");
      }
    });
    const refresh = () => {
      void load().catch((e) => setError(errorMessage(e)));
    };
    const auth = () => {
      void load(true).catch((e) => setError(errorMessage(e)));
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("om-auth-change", auth);
    return () => {
      active.current = false;
      generation.current++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("om-auth-change", auth);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    current.current = value;
    if (JSON.stringify(value) === baseline.current && !pending.current) return;
    if (!ownerRef.current) {
      try {
        localStorage.setItem(guestCart, JSON.stringify(value.cart));
        localStorage.setItem(
          guestDraft,
          JSON.stringify({
            draft: value.draft,
            step: value.step,
            editing: value.editing,
          }),
        );
        baseline.current = JSON.stringify(value);
        setStatus("local");
      } catch (e) {
        setError(errorMessage(e));
      }
      return;
    }
    pending.current = value;
    try {
      cache(value);
    } catch {}
    if (blocked.current) return;
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush().catch(() => {}), 600);
  }, [value, ready]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current && ownerRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function checkout(expectedTotal: number) {
    if (!ownerRef.current) throw Error("광고주 로그인 후 주문해주세요.");
    await flush();
    if (blocked.current) throw Error("변경 내용을 먼저 확인해주세요.");
    request.current ||= {
      action: "checkout",
      owner: ownerRef.current,
      id: crypto.randomUUID(),
      version: version.current,
      expectedTotal,
      consent: true,
    };
    const epoch = generation.current;
    const r = await fetch("/api/account-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.current),
      }),
      d = await r.json();
    if (epoch !== generation.current)
      throw Error("로그인 계정이 변경됐어요. 주문 내역을 확인해주세요.");
    if (r.status === 401 && d.code === "account_changed") {
      await load(true);
      throw Error(d.error);
    }
    if (r.status === 409) {
      blocked.current = true;
      setConflict(d.current);
      setStatus("conflict");
      throw Error(d.error);
    }
    if (!r.ok) throw Error(d.error);
    try {
      localStorage.removeItem("om_builder_pending:" + ownerRef.current);
    } catch {}
    request.current = null;
    apply(d.workspace);
    return d.order;
  }
  // A cart change starts a new idempotent checkout; unrelated draft typing does not.
  const cartIdentity = JSON.stringify(value.cart);
  useEffect(() => {
    request.current = null;
  }, [cartIdentity]);
  return {
    value,
    setValue,
    ready,
    owner,
    status,
    error,
    conflict,
    legacy,
    flush,
    checkout,
    retry: () => (ready ? flush() : load(true)),
    reload: async () => {
      pending.current = null;
      blocked.current = false;
      try {
        if (ownerRef.current)
          localStorage.removeItem("om_builder_pending:" + ownerRef.current);
      } catch {}
      await load(true);
    },
    overwrite: async () => {
      if (!conflict) return;
      version.current = conflict.version;
      blocked.current = false;
      setConflict(null);
      pending.current = current.current;
      await flush();
    },
    importLegacy: () => {
      if (!legacy) return;
      setValue(legacy);
      setLegacy(null);
      try {
        localStorage.removeItem(guestCart);
        localStorage.removeItem(guestDraft);
      } catch {}
    },
    dismissLegacy: () => {
      setLegacy(null);
      try {
        localStorage.removeItem(guestCart);
        localStorage.removeItem(guestDraft);
      } catch {}
    },
  };
}
