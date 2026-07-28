import net from "node:net";
import dns from "node:dns/promises";
import { SupabaseClient } from "@supabase/supabase-js";
import { analyzeContent } from "@/lib/ai/risk-analysis";
import { extractText } from "@/lib/ai/ocr";
import { hashDocument } from "@/lib/crypto/sign";
import { ValidationError } from "@/lib/errors";
import { Lang } from "@/lib/i18n";

export type SafetyCheckInputType = "link" | "qr" | "file" | "text";

type UrlSignal = { id: string; risk: number; explanation: string };

/** SSRF guard: rejects anything but a public http(s) URL. Self-contained
 * here rather than importing a shared url-intelligence module — none
 * currently exists as committed code in this repo. */
function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  const value = address.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value)
  );
}

async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ValidationError(
      "Only public HTTP(S) URLs without embedded credentials are supported.",
      "url"
    );
  }
  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new ValidationError("Local and private network destinations cannot be analyzed.", "url");
  }
}

/** A handful of deterministic, low-cost URL heuristics. Deliberately small —
 * analyzeContent() (the AI layer) carries most of the actual judgment. */
function analyzeUrlSignals(url: URL): UrlSignal[] {
  const signals: UrlSignal[] = [];
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:") {
    signals.push({ id: "no_https", risk: 25, explanation: "The URL does not use encrypted HTTPS." });
  }
  if (hostname.startsWith("xn--")) {
    signals.push({
      id: "homograph",
      risk: 35,
      explanation: "The hostname uses internationalized encoding that can disguise look-alike characters.",
    });
  }
  if (hostname.split(".").length > 4) {
    signals.push({
      id: "excessive_subdomains",
      risk: 15,
      explanation: "The hostname contains an unusually deep subdomain chain.",
    });
  }
  if (url.toString().length > 180 || /%[0-9a-f]{2}/i.test(url.pathname)) {
    signals.push({ id: "obfuscated_url", risk: 15, explanation: "The URL is unusually long or encoded." });
  }
  return signals;
}

async function followSafeRedirects(
  initial: URL
): Promise<{ chain: string[]; reachable: boolean }> {
  const chain = [initial.toString()];
  let current = initial;
  for (let index = 0; index < 5; index += 1) {
    await assertPublicHttpUrl(current);
    let response: Response;
    try {
      response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { "user-agent": "CHEKKAM-Safety-Check/1.0" },
      });
    } catch {
      return { chain, reachable: false };
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { chain, reachable: true };
    }
    const location = response.headers.get("location");
    if (!location) break;
    current = new URL(location, current);
    chain.push(current.toString());
  }
  return { chain, reachable: true };
}

export type SafetyCheckInput =
  | { inputType: "link" | "qr"; url: string; userId: string | null; language?: Lang }
  | { inputType: "text"; text: string; userId: string | null; language?: Lang }
  | {
      inputType: "file";
      fileBuffer: Buffer;
      fileName: string;
      mimeType: string;
      userId: string | null;
      language?: Lang;
    };

export type SafetyCheckResult = {
  id: string;
  input_type: SafetyCheckInputType;
  risk_level: "low" | "medium" | "high" | "critical";
  risk_score: number;
  findings: UrlSignal[] | { explanation: string }[];
  recommended_action: string;
};

/** Coarse 0-100 risk_score -> level mapping shared by every input type here. */
function riskLevelFor(score: number): SafetyCheckResult["risk_level"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

async function checkLinkOrQr(url: string, language: Lang): Promise<{
  riskScore: number;
  findings: UrlSignal[];
  action: string;
}> {
  const parsed = new URL(url);
  await assertPublicHttpUrl(parsed);

  const signals = analyzeUrlSignals(parsed);
  const redirect = await followSafeRedirects(parsed);
  if (!redirect.reachable) {
    signals.push({
      id: "unreachable",
      risk: 15,
      explanation: "CHEKKAM could not establish a safe connection to the destination.",
    });
  }
  if (redirect.chain.length > 3) {
    signals.push({
      id: "redirect_chain",
      risk: 20,
      explanation: `The URL passed through ${redirect.chain.length - 1} redirects.`,
    });
  }

  const ai = await analyzeContent(`${parsed.toString()}\nHost: ${parsed.hostname}`, {
    inputType: "link",
    preferredLanguage: language,
  });
  const deterministic = Math.min(100, signals.reduce((sum, s) => sum + s.risk, 0));
  const riskScore = Math.round(deterministic * 0.65 + ai.risk_score * 0.35);

  return {
    riskScore,
    findings: signals,
    action:
      riskScore >= 60
        ? "Do not enter credentials or download files. Verify the organization through an official channel."
        : "Continue cautiously and confirm the domain before sharing sensitive information.",
  };
}

/** PDF bytes containing a /JavaScript or /JS dictionary entry can execute
 * code when opened — a legitimate, simple malicious-PDF signal. */
function pdfHasEmbeddedJavaScript(buffer: Buffer): boolean {
  const sample = buffer.toString("latin1");
  return /\/JavaScript\b/.test(sample) || /\/JS\b/.test(sample);
}

async function checkFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ riskScore: number; findings: { explanation: string }[]; action: string }> {
  const findings: { explanation: string }[] = [];
  let riskScore = 0;

  if (mimeType === "application/pdf" && pdfHasEmbeddedJavaScript(fileBuffer)) {
    findings.push({
      explanation: "This PDF contains embedded JavaScript, which can run code when opened.",
    });
    riskScore += 45;
  }

  const extensionMime: Record<string, string[]> = {
    pdf: ["application/pdf"],
    png: ["image/png"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    webp: ["image/webp"],
  };
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const expectedMimes = extensionMime[extension];
  if (expectedMimes && !expectedMimes.includes(mimeType)) {
    findings.push({
      explanation: `The file extension (.${extension}) does not match its actual content type — a common disguise technique.`,
    });
    riskScore += 30;
  }

  if (findings.length === 0) {
    findings.push({ explanation: "No known malicious indicators were found in this file." });
  }

  return {
    riskScore: Math.min(100, riskScore),
    findings,
    action:
      riskScore >= 60
        ? "Do not open this file. Delete it and contact the sender through a separate, trusted channel."
        : "No high-risk indicators found, but this has not been reviewed by a person yet.",
  };
}

/**
 * Runs an on-demand "Safety Check" for user-submitted input (link, QR
 * payload, file, or pasted text like an SMS/email) — never autonomous
 * device introspection (see docs/api/security.md for why). One engine,
 * dispatched by input type; every branch reuses an existing analyzer
 * (lib/url-intelligence.ts, lib/ai/risk-analysis.ts, lib/ai/ocr.ts) rather
 * than reimplementing detection logic.
 */
export async function runSafetyCheck(
  admin: SupabaseClient,
  input: SafetyCheckInput
): Promise<SafetyCheckResult> {
  const language = input.language ?? "en";
  let riskScore: number;
  let findings: UrlSignal[] | { explanation: string }[];
  let action: string;
  let inputSummary: string;
  let evidenceId: string | null = null;

  switch (input.inputType) {
    case "link":
    case "qr": {
      const result = await checkLinkOrQr(input.url, language);
      riskScore = result.riskScore;
      findings = result.findings;
      action = result.action;
      inputSummary = input.url.slice(0, 500);
      break;
    }
    case "text": {
      const ai = await analyzeContent(input.text, { inputType: "text", preferredLanguage: language });
      riskScore = ai.risk_score;
      findings = ai.reasons.map((explanation) => ({ explanation }));
      action = ai.recommended_action;
      inputSummary = input.text.slice(0, 200);
      break;
    }
    case "file": {
      const fileHash = hashDocument(input.fileBuffer);
      const result = await checkFile(input.fileBuffer, input.fileName, input.mimeType);
      riskScore = result.riskScore;
      findings = result.findings;
      action = result.action;
      inputSummary = `${input.fileName} (sha256:${fileHash.slice(0, 12)}…)`;

      const { data: evidence } = await admin
        .from("evidence")
        .insert({ file_hash: fileHash, file_type: input.mimeType, status: "done" })
        .select("id")
        .single();
      evidenceId = evidence?.id ?? null;

      if (input.mimeType !== "application/pdf") {
        const ocr = await extractText(input.fileBuffer, input.mimeType);
        if (ocr.status === "done" && ocr.extracted_text.trim()) {
          const ai = await analyzeContent(ocr.extracted_text, {
            inputType: "text",
            preferredLanguage: language,
          });
          riskScore = Math.round(riskScore * 0.4 + ai.risk_score * 0.6);
          findings = [...findings, ...ai.reasons.map((explanation) => ({ explanation }))];
        }
      }
      break;
    }
  }

  const { data, error } = await admin
    .from("security_checks")
    .insert({
      user_id: input.userId,
      input_type: input.inputType,
      input_summary: inputSummary,
      risk_level: riskLevelFor(riskScore),
      risk_score: riskScore,
      findings,
      recommended_action: action,
      evidence_id: evidenceId,
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    input_type: input.inputType,
    risk_level: riskLevelFor(riskScore),
    risk_score: riskScore,
    findings,
    recommended_action: action,
  };
}
