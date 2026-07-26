import { RiskAnalysisResult } from "@/lib/ai/risk-analysis";
import { VerifyResult } from "@/lib/documents/verify";
import { SignDocumentResult } from "@/lib/documents/sign-document";

export type Lang = "en" | "fr" | "pidgin";

/**
 * Brand-voice reply templates (Brand Guide §6: calm, plain-language,
 * action-oriented, never shaming; emoji acceptable here per §5). EN is the
 * complete reference set; FR/Pidgin cover the same result types so no
 * language is treated as an afterthought translation.
 */

const RISK_LABEL: Record<string, Record<Lang, string>> = {
  low: { en: "Low risk", fr: "Risque faible", pidgin: "Small risk" },
  medium: { en: "Medium risk", fr: "Risque moyen", pidgin: "Medium risk" },
  high: { en: "Likely scam (High risk)", fr: "Probable arnaque (Risque élevé)", pidgin: "E fit be scam (Big risk)" },
  critical: { en: "Likely scam (Critical risk)", fr: "Probable arnaque (Risque critique)", pidgin: "Na scam fo real (Critical risk)" },
};

const RISK_EMOJI: Record<string, string> = { low: "✅", medium: "⚠️", high: "⚠️", critical: "❌" };

export function riskReply(analysis: RiskAnalysisResult, lang: Lang = "en"): string {
  const emoji = RISK_EMOJI[analysis.risk_level] ?? "⚠️";
  const label = RISK_LABEL[analysis.risk_level]?.[lang] ?? RISK_LABEL[analysis.risk_level]?.en;
  const reason = analysis.reasons[0] ?? "";

  const bodies: Record<Lang, string> = {
    en:
      `${emoji} *${label}.* ${reason} ${analysis.recommended_action} ` +
      `A Chekkam analyst will review reports like this.`,
    fr:
      `${emoji} *${label}.* ${reason} ${analysis.recommended_action} ` +
      `Un analyste Chekkam va examiner ce type de signalement.`,
    pidgin:
      `${emoji} *${label}.* ${reason} ${analysis.recommended_action} ` +
      `Chekkam analyst go check dis kind report.`,
  };
  return bodies[lang] ?? bodies.en;
}

export function verifyReply(result: VerifyResult, lang: Lang = "en"): string {
  const institution = result.institution ? `**${result.institution}**` : "the issuing institution";

  const templates: Record<VerifyResult["status"], Record<Lang, string>> = {
    genuine: {
      en: `✅ *Genuine.* This document was issued by ${institution} and has not been altered.${result.verification_id ? ` Verification ID: ${result.verification_id}.` : ""}`,
      fr: `✅ *Authentique.* Ce document a été émis par ${institution} et n'a pas été modifié.${result.verification_id ? ` ID de vérification : ${result.verification_id}.` : ""}`,
      pidgin: `✅ *Na correct document.* ${institution} na im issue dis one, e no change.${result.verification_id ? ` Verification ID: ${result.verification_id}.` : ""}`,
    },
    tampered: {
      en: `❌ *Tampered.* A document with this ID exists, but the file you sent does not match the original. Treat it as not trustworthy.`,
      fr: `❌ *Falsifié.* Un document avec cet identifiant existe, mais le fichier envoyé ne correspond pas à l'original. Ne lui faites pas confiance.`,
      pidgin: `❌ *Dem don change am.* Document dey with dis ID, but di file wey you send no match di original one. No trust am.`,
    },
    revoked: {
      en: `⛔ *Revoked.* This document was withdrawn by the issuing institution.${result.reason ? ` Reason: ${result.reason}.` : ""}`,
      fr: `⛔ *Révoqué.* Ce document a été retiré par l'institution émettrice.${result.reason ? ` Raison : ${result.reason}.` : ""}`,
      pidgin: `⛔ *Dem cancel am.* Di institution wey issue dis document don withdraw am.${result.reason ? ` Reason: ${result.reason}.` : ""}`,
    },
    expired: {
      en: `⏳ *Expired.* This document's validity period has ended.${result.expiry_date ? ` It expired on ${result.expiry_date}.` : ""} Contact ${institution} if you need a current one.`,
      fr: `⏳ *Expiré.* La période de validité de ce document est terminée.${result.expiry_date ? ` Il a expiré le ${result.expiry_date}.` : ""} Contactez ${institution} si vous avez besoin d'un document à jour.`,
      pidgin: `⏳ *E don expire.* Dis document validity don finish.${result.expiry_date ? ` E expire on ${result.expiry_date}.` : ""} Contact ${institution} if you need one wey still dey valid.`,
    },
    not_found: {
      en: `❓ *Not found.* No document matches what you sent. Double-check the ID/PIN or contact the issuing institution.`,
      fr: `❓ *Introuvable.* Aucun document ne correspond à ce que vous avez envoyé. Vérifiez l'ID/PIN ou contactez l'institution émettrice.`,
      pidgin: `❓ *We no see am.* No document match wetin you send. Check di ID/PIN again or contact di institution.`,
    },
  };

  return templates[result.status][lang] ?? templates[result.status].en;
}

export function signSuccessReply(result: SignDocumentResult, lang: Lang = "en"): string {
  const bodies: Record<Lang, string> = {
    en:
      `✅ Signed. Verification ID: *${result.verification_id}* · PIN: *${result.pin_code}*. ` +
      `Anyone can verify this at ${result.qr_payload} or by sending the document to this number. (QR image attached.)`,
    fr:
      `✅ Signé. ID de vérification : *${result.verification_id}* · PIN : *${result.pin_code}*. ` +
      `Tout le monde peut vérifier sur ${result.qr_payload} ou en envoyant le document à ce numéro. (Image QR jointe.)`,
    pidgin:
      `✅ Don sign am. Verification ID: *${result.verification_id}* · PIN: *${result.pin_code}*. ` +
      `Anybody fit verify am for ${result.qr_payload} or send di document to dis number. (QR image dey attach.)`,
  };
  return bodies[lang] ?? bodies.en;
}

export function signRefusedReply(lang: Lang = "en"): string {
  const bodies: Record<Lang, string> = {
    en: "This number isn't authorized to sign documents. Ask your institution's admin to link and verify it in the Chekkam dashboard first.",
    fr: "Ce numéro n'est pas autorisé à signer des documents. Demandez à l'administrateur de votre institution de le lier et de le vérifier d'abord dans le tableau de bord Chekkam.",
    pidgin: "Dis number no get permission to sign document. Ask your institution admin to link and verify am for Chekkam dashboard first.",
  };
  return bodies[lang] ?? bodies.en;
}

export function reportConfirmationReply(lang: Lang = "en"): string {
  const bodies: Record<Lang, string> = {
    en:
      "Thanks — this has been queued for a Chekkam analyst to review before anything is published. " +
      "If this is an emergency, please contact official emergency services now — this channel is a community information tool, not a replacement for them.",
    fr:
      "Merci — ceci a été mis en file d'attente pour qu'un analyste Chekkam l'examine avant toute publication. " +
      "En cas d'urgence, contactez immédiatement les services d'urgence officiels — ce canal est un outil d'information communautaire, pas un remplacement.",
    pidgin:
      "Thank you — Chekkam analyst go check dis one before anything publish. " +
      "If na emergency, contact official emergency services now — dis channel na community info tool, e no be replacement for dem.",
  };
  return bodies[lang] ?? bodies.en;
}

export function mediaErrorReply(lang: Lang = "en"): string {
  const bodies: Record<Lang, string> = {
    en: "Sorry, we couldn't read that file. Please try sending it again, or type the verification ID/PIN instead.",
    fr: "Désolé, nous n'avons pas pu lire ce fichier. Veuillez réessayer, ou tapez l'ID/PIN de vérification à la place.",
    pidgin: "Sorry, we no fit read dat file. Try send am again, or type di verification ID/PIN instead.",
  };
  return bodies[lang] ?? bodies.en;
}

export function helpReply(): string {
  return (
    "*Chekkam* — One check. Total trust.\n\n" +
    "• Send a message or link to check it for scam risk.\n" +
    "• Send a photo/PDF of a document (or its QR code) to verify it.\n" +
    "• Type `REPORT <description>` to flag a local safety issue.\n" +
    "• Institution officers: `SIGN <document type> | <recipient name>` (attach the file) to sign a document.\n\n" +
    "*FR:* Envoyez un message/lien à vérifier, une photo de document, ou `REPORT <description>`.\n" +
    "*Pidgin:* Send message/link make we check am, send document photo, or type `REPORT <wetin dey happen>`."
  );
}
