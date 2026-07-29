#!/usr/bin/env -S npx tsx
// One-command demo setup (Phase 2 spec §8.1). Idempotent — safe to re-run;
// re-running skips anything that already exists rather than duplicating it.
// Runs automatically on every deploy (see package.json's "start" script).
//
// Seeds:
//   - the fixed demo institution (id below), matching the DOCUMENT_SIGNING_KEY_*
//     private key already provisioned in Railway — this script never generates
//     a keypair, it only writes the public key/metadata that must match it.
//   - one super_admin login + one institution_officer login
//   - one verified channel_identities row (WhatsApp + Telegram) for the demo sender
//   - the sample fake-scholarship public_alerts row (SRS Appendix), published
//   - one partner/extension API key
//   - a pre-signed sample document (docs/demo/sample_certificate.pdf), signed
//     through the exact same signDocumentCore() path the HTTP /api/documents/sign
//     route uses — so the demo's Genuine/Tampered/Not Found/Revoked walkthrough
//     is real, not simulated.
//
// Usage: npm run db:seed  (or: npx tsx scripts/seed.ts)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./lib/load-env.mjs";
import { signDocumentCore } from "../lib/documents/sign-document";

loadEnv();
requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Fixed so it matches the DOCUMENT_SIGNING_KEY_<id> private key already set in
// Railway — this script must never generate a new keypair for this institution.
const INSTITUTION_ID = "0b8929f6-22e2-400a-8d91-af9e7f70280c";
const INSTITUTION_NAME = "Lycée Bilingue de Yaoundé";
const INSTITUTION_PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0y671FNNaIqTtmSQvSG9G2ThKniv\nKa3YQUgmGrTj7jd+xnLyvpVyX6S2c001RJrpa5uDhNSA59zwa6xEk3O0vA==\n-----END PUBLIC KEY-----";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@chekkam.demo";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChekkamDemo123!";
const OFFICER_EMAIL = process.env.SEED_OFFICER_EMAIL || "officer@chekkam.demo";
const OFFICER_PASSWORD = process.env.SEED_OFFICER_PASSWORD || "ChekkamDemo123!";
const DEMO_WHATSAPP_NUMBER = process.env.DEMO_WHATSAPP_NUMBER || "237600000001";
const DEMO_TELEGRAM_ID = process.env.DEMO_TELEGRAM_ID || "000000001";
const PARTNER_ORG_NAME = "Chekkam Demo Partner";
const SAMPLE_DOCUMENT_TYPE = "demo_certificate";
const SAMPLE_DOCUMENT_PATH = path.resolve(process.cwd(), "docs/demo/sample_certificate.pdf");

const log = (...args: unknown[]) => console.log("→", ...args);
const section = (title: string) => console.log(`\n=== ${title} ===`);

function envVarNameFor(institutionId: string): string {
  return `DOCUMENT_SIGNING_KEY_${institutionId.replace(/-/g, "_").toUpperCase()}`;
}

async function getOrCreateAuthUser(email: string, password: string) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) {
    log(`Created auth user ${email}`);
    return created.user;
  }

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`Could not create or find user ${email}: ${error.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`Could not create or find user ${email}: ${error.message}`);
  log(`Auth user ${email} already exists`);
  return existing;
}

async function upsertProfile(userId: string, role: string, displayName: string) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, role, display_name: displayName }, { onConflict: "id" });
  if (error) throw error;
}

async function ensureInstitution(): Promise<string> {
  const envVarName = envVarNameFor(INSTITUTION_ID);
  const { data: existing } = await supabase
    .from("institutions")
    .select("id")
    .eq("id", INSTITUTION_ID)
    .maybeSingle();

  if (existing) {
    log(`Institution "${INSTITUTION_NAME}" already exists (id: ${INSTITUTION_ID})`);
    return INSTITUTION_ID;
  }

  const { error } = await supabase.from("institutions").insert({
    id: INSTITUTION_ID,
    name: INSTITUTION_NAME,
    type: "school",
    verified: true,
    status: "active",
    signing_public_key: INSTITUTION_PUBLIC_KEY_PEM,
    signing_key_ref: envVarName,
    contact_email: "admin@example.cm",
  });
  if (error) throw error;

  log(`Created institution "${INSTITUTION_NAME}" (id: ${INSTITUTION_ID})`);
  log(`Expects its private key in env var: ${envVarName} (set this in Railway if not already)`);
  return INSTITUTION_ID;
}

async function ensureInstitutionMember(institutionId: string, userId: string) {
  const { error } = await supabase
    .from("institution_members")
    .upsert(
      { institution_id: institutionId, user_id: userId, role: "officer" },
      { onConflict: "institution_id,user_id" }
    );
  if (error) throw error;
}

async function ensureChannelIdentity(
  channel: string,
  externalId: string,
  profileId: string,
  institutionId: string
) {
  const { error } = await supabase.from("channel_identities").upsert(
    {
      channel,
      external_id: externalId,
      profile_id: profileId,
      institution_id: institutionId,
      verified: true,
      verify_code: null,
    },
    { onConflict: "channel,external_id" }
  );
  if (error) throw error;
  log(`Verified ${channel} identity ${externalId} -> officer (can sign for this institution)`);
}

async function ensureSampleAlert(createdBy: string) {
  const title = "Fake scholarship offer circulating on WhatsApp";
  const { data: existing } = await supabase
    .from("public_alerts")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  if (existing) {
    log(`Sample public alert already exists (id: ${existing.id})`);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("public_alerts")
    .insert({
      title,
      body:
        "A message claiming to offer a government scholarship requiring an upfront " +
        '"processing fee" is circulating. This is not a legitimate government process. ' +
        "Do not send payment.",
      alert_type: "scam_campaign",
      severity: "warning",
      published: true,
      published_at: new Date().toISOString(),
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  log(`Created and published sample alert (id: ${data.id})`);
  return data.id as string;
}

async function ensurePartnerApiKey() {
  const { data: existing } = await supabase
    .from("api_keys")
    .select("id, key_prefix")
    .eq("organization_name", PARTNER_ORG_NAME)
    .maybeSingle();
  if (existing) {
    log(`Partner API key already exists (prefix: ${existing.key_prefix}) — not reprinting the secret.`);
    return null;
  }

  const plainKey = `chk_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(plainKey).digest("hex");
  const keyPrefix = plainKey.slice(0, 12);

  const { error } = await supabase.from("api_keys").insert({
    organization_name: PARTNER_ORG_NAME,
    key_hash: keyHash,
    key_prefix: keyPrefix,
  });
  if (error) throw error;
  log(`Created partner API key (prefix: ${keyPrefix})`);
  return plainKey;
}

async function ensureSampleDocument(institutionId: string, officerId: string) {
  const { data: existing } = await supabase
    .from("documents")
    .select("id, verification_id, pin_code")
    .eq("institution_id", institutionId)
    .eq("document_type", SAMPLE_DOCUMENT_TYPE)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    log(`Active sample demo document already exists (verification_id: ${existing.verification_id}, PIN: ${existing.pin_code})`);
    return { verification_id: existing.verification_id as string, pin_code: existing.pin_code as string };
  }

  if (!fs.existsSync(SAMPLE_DOCUMENT_PATH)) {
    log(`Skipped sample document — ${SAMPLE_DOCUMENT_PATH} not found.`);
    return null;
  }

  const fileBuffer = fs.readFileSync(SAMPLE_DOCUMENT_PATH);
  const result = await signDocumentCore(supabase, {
    institutionId,
    documentType: SAMPLE_DOCUMENT_TYPE,
    recipientName: "Demo Recipient",
    fileBuffer,
    actorId: officerId,
    auditAction: "document.sign",
  });
  log(`Signed sample demo document (verification_id: ${result.verification_id}, PIN: ${result.pin_code})`);
  return { verification_id: result.verification_id, pin_code: result.pin_code };
}

async function main() {
  section("Auth users");
  const admin = await getOrCreateAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const officer = await getOrCreateAuthUser(OFFICER_EMAIL, OFFICER_PASSWORD);
  await upsertProfile(admin.id, "super_admin", "Chekkam Demo Admin");
  await upsertProfile(officer.id, "institution_officer", "Chekkam Demo Officer");

  section("Institution");
  const institutionId = await ensureInstitution();
  await ensureInstitutionMember(institutionId, officer.id);

  section("Channel identities (enables SIGN over chat)");
  await ensureChannelIdentity("whatsapp", DEMO_WHATSAPP_NUMBER, officer.id, institutionId);
  await ensureChannelIdentity("telegram", DEMO_TELEGRAM_ID, officer.id, institutionId);

  section("Sample public alert");
  await ensureSampleAlert(admin.id);

  section("Partner/extension API key");
  const partnerKey = await ensurePartnerApiKey();

  section("Sample signed document (for the verify demo)");
  const sampleDoc = await ensureSampleDocument(institutionId, officer.id);

  section("Done — demo setup summary");
  console.log(`
Logins (web dashboard /login):
  Super admin:         ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  Institution officer: ${OFFICER_EMAIL} / ${OFFICER_PASSWORD}

Institution: "${INSTITUTION_NAME}" (id: ${institutionId})
  Expected signing key env var: ${envVarNameFor(institutionId)}

Demo channel identities:
  WhatsApp: ${DEMO_WHATSAPP_NUMBER}
  Telegram: ${DEMO_TELEGRAM_ID}

Sample public alert: published and visible at /api/public-alerts, the web
alert page, and the Flutter app's public alerts screen.

Partner/extension API key: ${partnerKey ? `${partnerKey}\n  (store this now, it will not be shown again)` : "already issued on a previous run"}

Sample demo document (upload docs/demo/sample_certificate.pdf to verify -> Genuine):
${sampleDoc ? `  Verification ID: ${sampleDoc.verification_id}\n  PIN: ${sampleDoc.pin_code}` : "  Not created — see warning above."}
`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
