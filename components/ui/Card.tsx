import type { ReactNode } from "react";

/** The repeated card-panel wrapper (FR-017/018): rounded border, raised surface, soft shadow. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised shadow-chekkam-sm ${className}`}
    >
      {children}
    </div>
  );
}
