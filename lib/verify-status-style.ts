import type { Lang } from "@/lib/i18n";

type VerifyStatusStyle = {
  label: string;
  gradient: string;
  icon: string;
  guidance: string;
};

const BASE_STYLE: Record<string, Pick<VerifyStatusStyle, "gradient" | "icon">> = {
  genuine: { gradient: "from-status-success to-emerald-800", icon: "✓" },
  tampered: { gradient: "from-status-danger to-rose-900", icon: "✕" },
  revoked: { gradient: "from-status-neutral to-slate-700", icon: "⊘" },
  not_found: { gradient: "from-status-neutral to-slate-700", icon: "?" },
};

const COPY: Record<string, Record<Lang, Pick<VerifyStatusStyle, "label" | "guidance">>> = {
  genuine: {
    en: {
      label: "Genuine.",
      guidance: "Its signature matches the issuing institution's records and has not been revoked.",
    },
    fr: {
      label: "Authentique.",
      guidance:
        "Sa signature correspond aux dossiers de l'institution émettrice et le document n'a pas été révoqué.",
    },
  },
  tampered: {
    en: {
      label: "Tampered.",
      guidance: "The content does not match what was signed. Contact the issuing institution before relying on it.",
    },
    fr: {
      label: "Falsifié.",
      guidance:
        "Le contenu ne correspond pas à ce qui a été signé. Contactez l'institution émettrice avant de vous y fier.",
    },
  },
  revoked: {
    en: {
      label: "Revoked.",
      guidance: "The issuing institution withdrew this document. See the reason below if provided.",
    },
    fr: {
      label: "Révoqué.",
      guidance: "L'institution émettrice a retiré ce document. Consultez la raison ci-dessous si elle est fournie.",
    },
  },
  not_found: {
    en: {
      label: "Not found.",
      guidance: "Double-check the ID or PIN, or contact the issuing institution if you believe this is a mistake.",
    },
    fr: {
      label: "Introuvable.",
      guidance: "Vérifiez l'ID ou le PIN, ou contactez l'institution émettrice si vous pensez qu'il s'agit d'une erreur.",
    },
  },
};

export function getVerifyStatusStyle(status: string, lang: Lang): VerifyStatusStyle {
  const key = status in BASE_STYLE ? status : "not_found";
  return {
    ...BASE_STYLE[key],
    ...(COPY[key][lang] ?? COPY[key].en),
  };
}
