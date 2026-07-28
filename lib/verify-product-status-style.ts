import type { Lang } from "@/lib/i18n";

/**
 * Product Authenticity Platform (Phase 10) — kept fully separate from
 * lib/verify-status-style.ts since the six product states (authentic/
 * counterfeit/expired/recalled/stolen/unknown) don't map 1:1 onto the four
 * document states (genuine/tampered/revoked/not_found).
 */
type VerifyStatusStyle = {
  label: string;
  gradient: string;
  icon: string;
  guidance: string;
};

const BASE_STYLE: Record<string, Pick<VerifyStatusStyle, "gradient" | "icon">> = {
  authentic: { gradient: "from-status-success to-emerald-800", icon: "✓" },
  counterfeit: { gradient: "from-status-danger to-rose-900", icon: "✕" },
  stolen: { gradient: "from-status-danger to-rose-900", icon: "!" },
  recalled: { gradient: "from-amber-500 to-amber-800", icon: "⚠" },
  expired: { gradient: "from-amber-500 to-amber-800", icon: "⏱" },
  unknown: { gradient: "from-status-neutral to-slate-700", icon: "?" },
};

const COPY: Record<string, Record<Lang, Pick<VerifyStatusStyle, "label" | "guidance">>> = {
  authentic: {
    en: {
      label: "Authentic.",
      guidance: "This product's signature matches the manufacturer's records and is currently active.",
    },
    fr: {
      label: "Authentique.",
      guidance: "La signature de ce produit correspond aux dossiers du fabricant et il est actuellement actif.",
    },
  },
  counterfeit: {
    en: {
      label: "Counterfeit.",
      guidance: "This product ID does not match any record we can cryptographically verify. Treat it as counterfeit.",
    },
    fr: {
      label: "Contrefaçon.",
      guidance: "Cet identifiant de produit ne correspond à aucun dossier vérifiable. Considérez-le comme une contrefaçon.",
    },
  },
  stolen: {
    en: {
      label: "Reported stolen.",
      guidance: "The manufacturer has reported this specific product as stolen. See the reason below if provided.",
    },
    fr: {
      label: "Signalé volé.",
      guidance: "Le fabricant a signalé ce produit comme volé. Consultez la raison ci-dessous si elle est fournie.",
    },
  },
  recalled: {
    en: {
      label: "Recalled.",
      guidance: "The manufacturer has recalled this product. See the reason below if provided.",
    },
    fr: {
      label: "Rappelé.",
      guidance: "Le fabricant a rappelé ce produit. Consultez la raison ci-dessous si elle est fournie.",
    },
  },
  expired: {
    en: {
      label: "Expired.",
      guidance: "This product's shelf life has ended. See the expiry date below.",
    },
    fr: {
      label: "Expiré.",
      guidance: "La durée de vie de ce produit est terminée. Consultez la date d'expiration ci-dessous.",
    },
  },
  unknown: {
    en: {
      label: "Unrecognized code.",
      guidance: "This doesn't look like a Chekkam product code. Double-check what you scanned or typed.",
    },
    fr: {
      label: "Code non reconnu.",
      guidance: "Ceci ne ressemble pas à un code produit Chekkam. Vérifiez ce que vous avez scanné ou saisi.",
    },
  },
};

export function getProductVerifyStatusStyle(status: string, lang: Lang): VerifyStatusStyle {
  const key = status in BASE_STYLE ? status : "unknown";
  return {
    ...BASE_STYLE[key],
    ...(COPY[key][lang] ?? COPY[key].en),
  };
}
