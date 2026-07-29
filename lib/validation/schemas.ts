import { z } from "zod";

export const reportCreateSchema = z
  .object({
    content_type: z.enum(["text", "link", "image", "file", "video", "audio"]),
    raw_content: z.string().min(1).optional(),
    file_url: z.string().url().optional(),
    channel: z
      .enum(["mobile", "web", "whatsapp", "telegram", "api", "extension", "share_intent"])
      .default("mobile"),
    language: z
      .enum(["en", "fr", "pidgin", "mixed", "unknown"])
      .default("unknown"),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    /** Links a prior POST /api/ocr/upload result to this report (evidence.report_id). */
    evidence_id: z.string().uuid().optional(),
    /** Structured mobile-money fields (Phase 12) — optional on every report,
     * not just mobile-money ones. Seeded into the fingerprint alongside
     * whatever's auto-extracted from raw_content (lib/campaigns/fingerprint.ts). */
    phone_number: z.string().max(32).optional(),
    wallet_number: z.string().max(32).optional(),
    merchant_name: z.string().max(200).optional(),
    transaction_reference: z.string().max(100).optional(),
    network_provider: z.enum(["mtn", "orange", "express_union", "other"]).optional(),
  })
  .refine(
    (data) =>
      data.content_type === "text" || data.content_type === "link"
        ? !!data.raw_content
        : true,
    {
      message: "raw_content is required for content_type=text or link",
      path: ["raw_content"],
    }
  )
  .refine(
    (data) =>
      ["image", "file", "video", "audio"].includes(data.content_type)
        ? !!data.file_url
        : true,
    {
      message: "file_url is required for content_type=image, file, video, or audio",
      path: ["file_url"],
    }
  );

export const reportUpdateSchema = z.object({
  status: z.enum([
    "pending",
    "analyzed",
    "under_review",
    "verified_threat",
    "false_report",
    "dismissed",
    "resolved",
  ]),
});

export const documentSignSchema = z.object({
  institution_id: z.string().uuid(),
  document_type: z.string().min(1),
  recipient_name: z.string().optional(),
  /** Date string (e.g. "2027-01-31" from an HTML date input, or full ISO). Optional — most document types (certificates, letters) never expire. */
  expiry_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "expiry_date must be a valid date")
    .optional(),
});

export const documentRevokeSchema = z.object({
  reason: z.string().min(1),
});

// Phase 11 — Cameroon Trusted Institution Registry: widened to cover the
// categories citizens need to be able to trust/search (0015_institution_registry.sql).
export const INSTITUTION_TYPES = [
  "ministry",
  "exam_board",
  "school",
  "university",
  "company",
  "ngo",
  "media",
  "civil_registry",
  "other",
  "manufacturer",
  "hospital",
  "bank",
  "telecom_operator",
  "council",
  "court",
  "police",
  "gendarmerie",
] as const;

export const institutionSignupSchema = z.object({
  institution_name: z.string().min(1),
  institution_type: z.enum(INSTITUTION_TYPES),
  officer_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const institutionCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(INSTITUTION_TYPES),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
});

// Phase 10 — Product Authenticity Platform
export const PRODUCT_CATEGORIES = [
  "medicine",
  "food",
  "agriculture",
  "electronics",
  "construction_materials",
  "automotive_parts",
  "engine_oil",
  "cosmetics",
  "luxury",
  "alcohol",
  "beverages",
  "retail",
  "other",
] as const;

export const productRegisterSchema = z.object({
  institution_id: z.string().uuid(),
  product_name: z.string().min(1),
  category: z.enum(PRODUCT_CATEGORIES),
  batch_number: z.string().optional(),
  manufactured_at: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "manufactured_at must be a valid date")
    .optional(),
  expiry_date: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "expiry_date must be a valid date")
    .optional(),
});

export const productStatusUpdateSchema = z
  .object({
    action: z.enum(["recall", "mark_stolen", "reactivate"]),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => data.action === "reactivate" || !!data.reason, {
    message: "reason is required for recall and mark_stolen",
    path: ["reason"],
  });

export const institutionStatusUpdateSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

// Phase 11 — self-serve citizen signup (role: 'citizen', no institution).
// profiles has no public INSERT policy (by design — role must never be
// client-settable), so account creation always goes through this
// service-role-backed route, same pattern as institutionSignupSchema.
export const citizenSignupSchema = z.object({
  display_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const campaignUpdateSchema = z.object({
  action: z.enum(["confirm", "merge", "split", "dismiss"]),
  merged_into: z.string().uuid().optional(),
});

export const pushRegisterSchema = z.object({
  fcm_token: z.string().min(1),
  platform: z.enum(["android", "ios"]),
});

export const publicAlertCreateSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  alert_type: z.enum([
    "scam_campaign",
    "document_fraud",
    "safety_incident",
    "general_advisory",
  ]),
  related_campaign_id: z.string().uuid().optional(),
  severity: z.enum(["info", "warning", "critical"]),
});

export const apiKeyIssueSchema = z.object({
  organization_name: z.string().min(1),
  scopes: z.array(z.string()).default([]),
  rate_limit_per_minute: z.number().int().min(1).max(10_000).optional(),
});

export const channelIdentityCreateSchema = z.object({
  channel: z.enum(["whatsapp", "telegram"]),
  external_id: z.string().min(1),
});

export const channelIdentityVerifySchema = z.object({
  channel: z.enum(["whatsapp", "telegram"]),
  external_id: z.string().min(1),
  code: z.string().min(4).max(8),
});

export const publicAlertFromReportSchema = z
  .object({
    report_id: z.string().uuid().optional(),
    campaign_id: z.string().uuid().optional(),
  })
  .refine((data) => !!data.report_id || !!data.campaign_id, {
    message: "Provide either report_id or campaign_id.",
    path: ["report_id"],
  });

export const publicAlertUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  alert_type: z
    .enum(["scam_campaign", "document_fraud", "safety_incident", "general_advisory"])
    .optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
});

export const safetyAlertCreateSchema = z.object({
  category: z.enum([
    "violent_crime",
    "accident",
    "fire",
    "natural_hazard",
    "civil_unrest",
    "missing_person",
    "other",
  ]),
  description: z.string().min(1),
  media_url: z.string().url().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  location_precision: z.enum(["exact", "approximate"]).default("approximate"),
  radius_meters: z.number().int().min(100).max(20000).default(1000),
});
