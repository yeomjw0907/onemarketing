"use client";
import { ThinkingOrb, type OrbState, type OrbTheme } from "thinking-orbs";
import styles from "./brand-orb.module.css";

export default function BrandOrb({
  active,
  state = "working",
  size = 20,
  label,
  theme = "light",
}: {
  active: boolean;
  state?: OrbState;
  size?: 20 | 64;
  label?: string;
  theme?: OrbTheme;
}) {
  if (!active) return null;
  return (
    <span
      className={styles.root}
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      aria-hidden={label ? undefined : true}
      data-brand-orb
      data-orb-state={state}
    >
      <ThinkingOrb
        state={state}
        size={size}
        theme={theme}
        color="#3182F6"
        speed={0.85}
        aria-hidden="true"
      />
      {label && <span className={styles.label}>{label}</span>}
    </span>
  );
}
