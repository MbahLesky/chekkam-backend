import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Shared button (FR-017/018). Class strings below are lifted verbatim from
 * the ~15 hand-copied variants already in app/dashboard/*.tsx and
 * app/(auth)/*.tsx (bg-gradient-hero for primary, bg-status-danger for
 * danger, etc.) — this does not introduce a new visual style, it collects
 * the one that already exists so it stops being re-typed with small drifts.
 */
export type ButtonVariant = "primary" | "solid" | "outline" | "danger" | "success" | "ghost" | "tint";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-gradient-hero text-white shadow-chekkam-sm transition hover:brightness-110",
  solid: "bg-chekkam-primary text-white shadow-chekkam-sm transition hover:brightness-110",
  outline: "border border-chekkam-primary text-chekkam-primary transition hover:bg-chekkam-tint",
  danger: "bg-status-danger text-white shadow-chekkam-sm transition hover:brightness-110",
  success: "bg-status-success text-white shadow-chekkam-sm transition hover:brightness-110",
  ghost: "border border-chekkam-border text-chekkam-muted transition hover:bg-chekkam-tint",
  tint: "bg-chekkam-tint text-chekkam-muted transition hover:bg-chekkam-border",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`rounded-[var(--radius-chekkam-sm)] font-semibold disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? (loadingText ?? children) : children}
    </button>
  );
}
