#!/usr/bin/env -S npx tsx
// Idempotent demo-kit seed for the document-verification trust lifecycle
// (GENUINE / TAMPERED / REVOKED / NOT_FOUND). Fictional data only — see
// DEMO_DOCUMENT_VERIFICATION.md for the full walkthrough.
//
// Usage: npm run seed:demo-trust
//
// Disabled by default: requires DEMO_SEED_ENABLED=true. If the environment
// looks like production, additionally requires ALLOW_PRODUCTION_DEMO_SEED=true.
//
// Creates/updates, all via check-then-insert or upsert (safe to re-run):
//   - the fixed "Chekkam Demo University" institution (verified, active)
//   - one demo institution-officer login
//   - a GENUINE signed certificate (real signDocumentCore() path)
//   - a REVOKED signed certificate (signed, then revoked via revokeDocumentCore())
//   - a TAMPERED copy (same template, one changed field, deliberately never
//     signed or registered — stored in demo_trust_assets, not documents)
//   - an UNREGISTERED file (never touches signDocumentCore at all)
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./lib/load-env.mjs";
import { signDocumentCore } from "../lib/documents/sign-document";
import { revokeDocumentCore } from "../lib/documents/revoke";
import { generateSigningKeyPair, getInstitutionPrivateKey } from "../lib/crypto/sign";
import { generateVerificationId, generatePinCode } from "../lib/crypto/ids";
import { buildVerificationUrl } from "../lib/crypto/qrcode";
import { bufferToBytea } from "../lib/documents/bytea";
import { generateDemoCertificatePdf, demoCertificateFilename } from "../lib/documents/demo/certificate-template";

loadEnv();
requireEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

// --- Safety gate — this must never run silently against a real environment. ---
if (process.env.DEMO_SEED_ENABLED !== "true") {
  console.error(
    "Refusing to run: this seed creates/modifies a real institution, officer login, and " +
      "signed documents. Set DEMO_SEED_ENABLED=true to run it."
  );
  process.exit(1);
}
const looksLikeProduction =
  process.env.RAILWAY_ENVIRONMENT_NAME === "production" || process.env.NODE_ENV === "production";
if (looksLikeProduction && process.env.ALLOW_PRODUCTION_DEMO_SEED !== "true") {
  console.error(
    "\n!!! Refusing to run: this looks like a PRODUCTION environment " +
      `(RAILWAY_ENVIRONMENT_NAME=${process.env.RAILWAY_ENVIRONMENT_NAME ?? "unset"}, ` +
      `NODE_ENV=${process.env.NODE_ENV ?? "unset"}).\n` +
      "If you really intend to seed demo-trust data into production, set " +
      "ALLOW_PRODUCTION_DEMO_SEED=true and re-run.\n"
  );
  process.exit(1);
}
if (looksLikeProduction) {
  console.warn(
    "\n!!! WARNING: ALLOW_PRODUCTION_DEMO_SEED=true — seeding demo-trust data into what " +
      "looks like PRODUCTION. This will create a real institution/officer/documents " +
      "visible to real users. Proceeding in 3 seconds...\n"
  );
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Fixed id so re-running this script always finds the same institution
// instead of creating duplicates (same convention as scripts/seed.ts's
// demo institution).
const INSTITUTION_ID = "a94910a7-063d-4f8a-9f8c-7a169d71c65c";
const INSTITUTION_NAME = "Chekkam Demo University";
const INSTITUTION_DOMAIN = "demo.chekkam.cm";
const INSTITUTION_CONTACT_EMAIL = "verification@demo.chekkam.cm";
const OFFICER_EMAIL = process.env.DEMO_TRUST_OFFICER_EMAIL || "demo-officer@demo.chekkam.cm";
const OFFICER_PASSWORD = process.env.DEMO_TRUST_OFFICER_PASSWORD || "ChekkamDemoTrust123!";
const OFFICER_NAME = "Dr. Amina Bello";
const OFFICER_TITLE = "Registrar, Chekkam Demo University";

const GENUINE_DOCUMENT_TYPE = "demo_trust_genuine";
const REVOKED_DOCUMENT_TYPE = "demo_trust_revoked";
const GENUINE_ISSUE_DATE = "2026-01-15T00:00:00.000Z";
const REVOKED_ISSUE_DATE = "2026-01-20T00:00:00.000Z";
const REVOCATION_REASON = "Certificate reissued after correction of participant information.";
const UNREGISTERED_ISSUE_DATE = "2026-01-25T00:00:00.000Z";

const log = (...args: unknown[]) => console.log("→", ...args);
const section = (title: string) => console.log(`\n=== ${title} ===`);

function envVarNameFor(institutionId: string): string {
  return `DOCUMENT_SIGNING_KEY_${institutionId.replace(/-/g, "_").toUpperCase()}`;
}

async function ensureSigningKey(): Promise<void> {
  const envVarName = envVarNameFor(INSTITUTION_ID);
  if (process.env[envVarName]) {
    log(`Signing key already configured (${envVarName}).`);
    return;
  }
  const { publicKey, privateKey } = generateSigningKeyPair();
  // Real newlines are fine directly in process.env for this run — only the
  // *persisted* .env/Railway value needs the literal-\n one-line encoding
  // getInstitutionPrivateKey() unescapes on read.
  process.env[envVarName] = privateKey;
  log(`No ${envVarName} was configured — generated a fresh demo signing key for this run.`);
  console.log(`\n  PRIVATE KEY — SAVE THIS NOW, it will not be printed again:\n${privateKey}`);
  console.log(
    `  One-line .env value:\n  ${envVarName}=${privateKey.replace(/\n/g, "\\n")}\n`
  );
  console.log(
    "  Add this to your .env (and Railway variables, for the deployed environment) before " +
      "re-running this script — otherwise the next run generates a DIFFERENT key and the " +
      "documents just signed will start reporting Tampered.\n"
  );
  console.log(`  Public key (already stored in institutions.signing_public_key):\n${publicKey}\n`);
}

function configuredInstitutionPublicKey(): string {
  return crypto
    .createPublicKey(getInstitutionPrivateKey(INSTITUTION_ID))
    .export({ type: "spki", format: "pem" })
    .toString()
    .replace(/\r\n/g, "\n")
    .trim();
}

async function ensureInstitution(): Promise<string> {
  const publicKey = configuredInstitutionPublicKey();
  const envVarName = envVarNameFor(INSTITUTION_ID);
  const { data: existing } = await supabase
    .from("institutions")
    .select("id, signing_public_key")
    .eq("id", INSTITUTION_ID)
    .maybeSingle();

  if (existing) {
    const storedPublicKey = (existing.signing_public_key ?? "").replace(/\r\n/g, "\n").trim();
    if (storedPublicKey !== publicKey) {
      const { error } = await supabase
        .from("institutions")
        .update({ signing_public_key: publicKey, signing_key_ref: envVarName })
        .eq("id", INSTITUTION_ID);
      if (error) throw error;
      log("Synchronized the demo institution's public signing key with its configured private key.");
    }
    log(`Institution "${INSTITUTION_NAME}" already exists (id: ${INSTITUTION_ID})`);
    return INSTITUTION_ID;
  }

  const { error } = await supabase.from("institutions").insert({
    id: INSTITUTION_ID,
    name: INSTITUTION_NAME,
    // Closest existing institution "type" to the requested "Educational
    // Institution" — see DEMO_DOCUMENT_VERIFICATION.md for this mapping
    // decision (no new enum value was added for a cosmetic label).
    type: "university",
    verified: true,
    status: "active",
    signing_public_key: publicKey,
    signing_key_ref: envVarName,
    contact_email: INSTITUTION_CONTACT_EMAIL,
    verified_domains: [INSTITUTION_DOMAIN],
  });
  if (error) throw error;
  log(`Created institution "${INSTITUTION_NAME}" (id: ${INSTITUTION_ID})`);
  return INSTITUTION_ID;
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

async function ensureInstitutionMember(institutionId: string, userId: string) {
  const { error } = await supabase
    .from("institution_members")
    .upsert(
      { institution_id: institutionId, user_id: userId, role: "officer" },
      { onConflict: "institution_id,user_id" }
    );
  if (error) throw error;
}

type SignedDemoDoc = {
  id: string;
  verification_id: string;
  pin_code: string;
  status: string;
  file_hash: string;
  qr_payload: string;
};

async function fetchExistingDemoDoc(institutionId: string, documentType: string): Promise<SignedDemoDoc | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, verification_id, pin_code, status, file_hash")
    .eq("institution_id", institutionId)
    .eq("document_type", documentType)
    .maybeSingle();
  if (!data) return null;
  return { ...data, qr_payload: buildVerificationUrl(data.verification_id) } as SignedDemoDoc;
}

/** Signs a fresh demo certificate whose own visible content prints the exact
 * verification ID/PIN/QR that will end up in the DB row — pre-generating the
 * ID so it can be embedded before hashing (see SignDocumentInput.verificationId). */
async function signDemoCertificate(opts: {
  institutionId: string;
  officerId: string;
  documentType: string;
  title: string;
  recipientName: string;
  programme: string;
  result: string;
  issueDateIso: string;
}): Promise<SignedDemoDoc> {
  const verificationId = generateVerificationId();
  const pinCode = generatePinCode();
  const qrPayload = buildVerificationUrl(verificationId);

  const pdfBytes = await generateDemoCertificatePdf({
    title: opts.title,
    recipientName: opts.recipientName,
    programme: opts.programme,
    result: opts.result,
    issueDateIso: opts.issueDateIso,
    institutionName: INSTITUTION_NAME,
    officerName: OFFICER_NAME,
    officerTitle: OFFICER_TITLE,
    verificationId,
    pinCode,
    qrPayload,
  });

  const result = await signDocumentCore(supabase, {
    institutionId: opts.institutionId,
    documentType: opts.documentType,
    recipientName: opts.recipientName,
    fileBuffer: Buffer.from(pdfBytes),
    fileName: demoCertificateFilename(verificationId),
    actorId: opts.officerId,
    auditAction: "document.sign",
    verificationId,
    pinCode,
    issuedAt: opts.issueDateIso,
  });

  const { data: row } = await supabase
    .from("documents")
    .select("file_hash")
    .eq("id", result.id)
    .single();

  return {
    id: result.id,
    verification_id: result.verification_id,
    pin_code: result.pin_code,
    status: result.status,
    file_hash: row!.file_hash as string,
    qr_payload: qrPayload,
  };
}

async function ensureGenuineDocument(institutionId: string, officerId: string) {
  const existing = await fetchExistingDemoDoc(institutionId, GENUINE_DOCUMENT_TYPE);
  if (existing) {
    log(`Genuine demo document already exists (verification_id: ${existing.verification_id})`);
    return existing;
  }
  const created = await signDemoCertificate({
    institutionId,
    officerId,
    documentType: GENUINE_DOCUMENT_TYPE,
    title: "Certificate of Completion",
    recipientName: "Jane Demo Nfor",
    programme: "Cybersecurity and Digital Trust Fundamentals",
    result: "Successfully Completed",
    issueDateIso: GENUINE_ISSUE_DATE,
  });
  log(`Signed GENUINE demo document (verification_id: ${created.verification_id}, PIN: ${created.pin_code})`);
  return created;
}

async function ensureRevokedDocument(institutionId: string, officerId: string) {
  const existing = await fetchExistingDemoDoc(institutionId, REVOKED_DOCUMENT_TYPE);
  if (existing) {
    log(`Revoked demo document already exists (verification_id: ${existing.verification_id}, status: ${existing.status})`);
    return existing;
  }
  const created = await signDemoCertificate({
    institutionId,
    officerId,
    documentType: REVOKED_DOCUMENT_TYPE,
    title: "Certificate of Participation",
    recipientName: "Michael Demo Tabe",
    programme: "Digital Safety Awareness Workshop",
    result: "Successfully Completed",
    issueDateIso: REVOKED_ISSUE_DATE,
  });
  log(`Signed demo document to be revoked (verification_id: ${created.verification_id})`);

  await revokeDocumentCore(supabase, created.id, REVOCATION_REASON, officerId);
  log(`Revoked it — reason: "${REVOCATION_REASON}"`);
  return { ...created, status: "revoked" };
}

async function upsertDemoTrustAsset(key: string, bytes: Uint8Array, mimeType: string, fileName: string) {
  const { error } = await supabase.from("demo_trust_assets").upsert(
    {
      key,
      file_data: bufferToBytea(Buffer.from(bytes)),
      mime_type: mimeType,
      file_name: fileName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) throw error;
}

/** Deliberately never signed or registered — same template, one changed
 * field, so it still contains the genuine document's own verification ID as
 * findable/printed text (proving hash-mismatch tamper detection, not a
 * missing-record false negative). */
async function ensureTamperedAsset(genuine: SignedDemoDoc) {
  const bytes = await generateDemoCertificatePdf({
    title: "Certificate of Completion",
    recipientName: "Janet Demo Nfor", // the one changed value
    programme: "Cybersecurity and Digital Trust Fundamentals",
    result: "Successfully Completed",
    issueDateIso: GENUINE_ISSUE_DATE,
    institutionName: INSTITUTION_NAME,
    officerName: OFFICER_NAME,
    officerTitle: OFFICER_TITLE,
    verificationId: genuine.verification_id,
    pinCode: genuine.pin_code,
    qrPayload: genuine.qr_payload,
    isTestCopy: true,
  });
  const filename = demoCertificateFilename(genuine.verification_id, "TAMPERED");
  await upsertDemoTrustAsset("tampered", bytes, "application/pdf", filename);
  log(`Generated TAMPERED demo asset (${filename}) — recipient name changed after the fact, never re-signed or re-registered.`);
  return filename;
}

async function ensureUnregisteredAsset() {
  const verificationId = "CHK-UNRE-GIST"; // cosmetic only — never written anywhere; this file is never looked up by ID
  const bytes = await generateDemoCertificatePdf({
    title: "Certificate of Completion",
    recipientName: "Paul Demo Ngwa",
    programme: "Introductory Workshop (never submitted to Chekkam)",
    result: "Successfully Completed",
    issueDateIso: UNREGISTERED_ISSUE_DATE,
    institutionName: INSTITUTION_NAME,
    officerName: OFFICER_NAME,
    officerTitle: OFFICER_TITLE,
    verificationId,
    pinCode: "000000",
    qrPayload: buildVerificationUrl(verificationId),
  });
  const filename = "CHK-UNREGISTERED-DEMO.pdf";
  await upsertDemoTrustAsset("unregistered", bytes, "application/pdf", filename);
  log(`Generated UNREGISTERED demo asset (${filename}) — never hashed, signed, or inserted into documents.`);
  return filename;
}

async function main() {
  section("Signing key");
  await ensureSigningKey();

  section("Institution");
  const institutionId = await ensureInstitution();

  section("Demo officer");
  const officer = await getOrCreateAuthUser(OFFICER_EMAIL, OFFICER_PASSWORD);
  await upsertProfile(officer.id, "institution_officer", OFFICER_NAME);
  await ensureInstitutionMember(institutionId, officer.id);

  section("Genuine demo document");
  const genuine = await ensureGenuineDocument(institutionId, officer.id);

  section("Revoked demo document");
  const revoked = await ensureRevokedDocument(institutionId, officer.id);

  section("Tampered demo asset (never registered)");
  const tamperedFilename = await ensureTamperedAsset(genuine);

  section("Unregistered demo asset (never registered)");
  const unregisteredFilename = await ensureUnregisteredAsset();

  section("Done — demo-trust kit summary");
  const publicBase = process.env.APP_BASE_URL ?? "https://chekkam-backend-production.up.railway.app";
  console.log(`
Institution: "${INSTITUTION_NAME}" (id: ${institutionId})
  Domain: ${INSTITUTION_DOMAIN}
  Contact: ${INSTITUTION_CONTACT_EMAIL}

Demo officer login (web dashboard /login):
  ${OFFICER_EMAIL} / ${OFFICER_PASSWORD}

1. GENUINE
   Verification ID: ${genuine.verification_id}
   PIN: ${genuine.pin_code}
   Public verify URL: ${publicBase}/verify/${genuine.verification_id}
   Download: dashboard "Demo Trust Kit" page, or GET /api/documents/${genuine.id}/download-original

2. REVOKED
   Verification ID: ${revoked.verification_id}
   Status: ${revoked.status}
   Reason: ${REVOCATION_REASON}
   Public verify URL: ${publicBase}/verify/${revoked.verification_id}
   Download: dashboard "Demo Trust Kit" page, or GET /api/documents/${revoked.id}/download-original

3. TAMPERED
   File: ${tamperedFilename}
   Refers to the genuine document's own verification ID (${genuine.verification_id}) but its
   hash will not match — uploading it must report TAMPERED, never GENUINE or NOT_FOUND.
   Download: dashboard "Demo Trust Kit" page, or GET /api/demo-trust/download/tampered

4. UNREGISTERED
   File: ${unregisteredFilename}
   Never signed or inserted into documents — uploading it must report NOT_FOUND.
   Download: dashboard "Demo Trust Kit" page, or GET /api/demo-trust/download/unregistered

Re-running this script is safe — it will not create duplicates or a new signing key.
`);
}

main().catch((err) => {
  console.error("seed-demo-trust failed:", err);
  process.exit(1);
});
