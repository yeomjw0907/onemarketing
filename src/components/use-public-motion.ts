"use client";
import { useEffect, type RefObject } from "react";

export default function usePublicMotion(
  root: RefObject<HTMLDivElement | null>,
  pathname: string,
) {
  useEffect(() => {
    const element = root.current;
    if (!element || !window.IntersectionObserver || !Element.prototype.animate)
      return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const pending = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const target = entry.target as HTMLElement;
          target.dataset.motionSeen = "true";
          if (preference.matches) continue;
          const animation = target.animate(
            [
              { opacity: 0.4, transform: "translateY(10px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" },
          );
          animations.add(animation);
          const done = () => animations.delete(animation);
          animation.onfinish = done;
          animation.oncancel = done;
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -16px 0px" },
    );
    const scan = () => {
      element
        .querySelectorAll<HTMLElement>(
          ".service-products,.service-process,.service-login,.service-two,.bottomcallout,.docs-body section",
        )
        .forEach((target) => {
          if (target.dataset.motionSeen || pending.has(target)) return;
          pending.add(target);
          observer.observe(target);
        });
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(element, { childList: true, subtree: true });
    const stop = () => {
      if (preference.matches)
        animations.forEach((animation) => animation.cancel());
    };
    preference.addEventListener("change", stop);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      preference.removeEventListener("change", stop);
      animations.forEach((animation) => animation.cancel());
    };
  }, [root, pathname]);
}
