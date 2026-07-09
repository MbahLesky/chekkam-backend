/** Shared visual mapping for document verification results (FR-045), used by
 * both the direct-link verify page and the manual/upload verify hub so the
 * "seal moment" treatment stays identical everywhere. */
export const VERIFY_STATUS_STYLE: Record<
  string,
  { label: string; gradient: string; icon: string; guidance: string }
> = {
  genuine: {
    label: "Genuine.",
    gradient: "from-status-success to-emerald-800",
    icon: "✓",
    guidance: "Its signature matches the issuing institution's records and has not been revoked.",
  },
  tampered: {
    label: "Tampered.",
    gradient: "from-status-danger to-rose-900",
    icon: "✕",
    guidance: "The content does not match what was signed. Contact the issuing institution before relying on it.",
  },
  revoked: {
    label: "Revoked.",
    gradient: "from-status-neutral to-slate-700",
    icon: "⦸",
    guidance: "The issuing institution withdrew this document. See the reason below if provided.",
  },
  not_found: {
    label: "Not found.",
    gradient: "from-status-neutral to-slate-700",
    icon: "?",
    guidance:
      "Double-check the ID or PIN, or contact the issuing institution if you believe this is a mistake.",
  },
};
