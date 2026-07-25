import { NextResponse } from "next/server";
import { Lang, tt } from "@/lib/i18n";

/** Thrown when a required env var / external service credential is missing. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Thrown for well-formed requests that fail validation. */
export class ValidationError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

/** Thrown when a request is unauthenticated (401) or lacks the required role (403). */
export class AuthError extends Error {
  status: 401 | 403;
  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

type ErrorBody = {
  error: { code: string; message: string; field?: string };
};

function errorBody(code: string, message: string, field?: string): ErrorBody {
  return { error: { code, message, ...(field ? { field } : {}) } };
}

/** Standard error envelope per SRS 6.9. */
export function jsonError(
  code: string,
  message: string,
  status: number,
  field?: string
) {
  return NextResponse.json(errorBody(code, message, field), { status });
}

/**
 * Converts a thrown error into the SRS 6.9 error envelope. ConfigError becomes
 * a 503 with setup guidance rather than a generic 500, since "missing API key"
 * is an expected, recoverable state while the project is being wired up.
 */
export function toErrorResponse(err: unknown, lang: Lang = "en") {
  if (err instanceof ConfigError) {
    return jsonError("NOT_CONFIGURED", err.message, 503);
  }
  if (err instanceof ValidationError) {
    return jsonError("VALIDATION_ERROR", err.message, 400, err.field);
  }
  if (err instanceof AuthError) {
    return jsonError(
      err.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED",
      err.message,
      err.status
    );
  }
  console.error(err);
  return jsonError("INTERNAL_ERROR", tt("genericError", lang), 500);
}
