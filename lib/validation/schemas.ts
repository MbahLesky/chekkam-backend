import { z } from "zod";

export const reportCreateSchema = z
  .object({
    content_type: z.enum(["text", "link", "image", "file"]),
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
      data.content_type === "image" || data.content_type === "file"
        ? !!data.file_url
        : true,
    { message: "file_url is required for content_type=image or file", path: ["file_url"] }
  );

export const reportUpdateSchema = z.object({
  status: z.enum([
    "pending",
    "analyzed",
    "under_review",
    "verified_threat",
    "false_report",
    "dismissed",
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

export const institutionSignupSchema = z.object({
  institution_name: z.string().min(1),
  institution_type: z.enum([
    "ministry",
    "exam_board",
    "school",
    "university",
    "company",
    "ngo",
    "media",
    "civil_registry",
    "other",
  ]),
  officer_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const institutionCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "ministry",
    "exam_board",
    "school",
    "university",
    "company",
    "ngo",
    "media",
    "civil_registry",
    "other",
  ]),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
});

export const institutionStatusUpdateSchema = z.object({
  status: z.enum(["active", "suspended"]),
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
