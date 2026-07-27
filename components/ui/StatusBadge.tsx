/**
 * Small inline status pill (FR-017/018) for table rows and lists — distinct
 * from the big "seal moment" hero display in lib/verify-status-style.ts,
 * which already handles the full-page verify result correctly. This fixes
 * a real gap: the document list's status pill (app/dashboard/documents/
 * page.tsx) previously rendered colour + text only, no icon — a violation
 * of "status is never colour alone" (CLAUDE.md rule 9). The icon here is
 * `aria-hidden`: the visible text label is what actually carries the
 * accessible name, the icon is a redundant visual reinforcement for sighted
 * users who scan by colour/shape rather than reading every label.
 */
export type StatusTone = "success" | "danger" | "warning" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-status-success/12 text-status-success",
  danger: "bg-status-danger/12 text-status-danger",
  warning: "bg-status-warning/12 text-status-warning",
  neutral: "bg-status-neutral/12 text-status-neutral",
};

const DEFAULT_ICON: Record<StatusTone, string> = {
  success: "✓",
  danger: "✕",
  warning: "⚠",
  neutral: "⊘",
};

export function StatusBadge({
  tone,
  label,
  icon,
}: {
  tone: StatusTone;
  label: string;
  icon?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
      <span aria-hidden="true">{icon ?? DEFAULT_ICON[tone]}</span>
      {label}
    </span>
  );
}
