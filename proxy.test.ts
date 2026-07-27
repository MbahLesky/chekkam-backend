import { describe, test, expect } from "vitest";
import { isAllowedOrigin } from "./proxy";

// TASK 1 (2026-07-27): live-confirmed CORS bug — the Vercel citizen app got
// "Could not reach the Chekkam server" because ALLOWED_WEB_ORIGIN only did an
// exact string match, so any preview URL (or a misconfigured env var) fails
// closed. These pin the fix: production + any *.vercel.app preview allowed
// automatically, without needing an env var update per preview deploy.
describe("isAllowedOrigin", () => {
  test("allows the production Vercel origin", () => {
    expect(isAllowedOrigin("https://chekkam.vercel.app")).toBe(true);
  });

  test("allows an arbitrary Vercel preview subdomain", () => {
    expect(isAllowedOrigin("https://chekkam-git-feature-x-cybernurdin.vercel.app")).toBe(true);
  });

  test("allows any chrome-extension origin", () => {
    expect(isAllowedOrigin("chrome-extension://abcdefghijklmnop")).toBe(true);
  });

  test("rejects null/absent origin", () => {
    expect(isAllowedOrigin(null)).toBe(false);
  });

  test("rejects an unrelated origin not on vercel.app and not in ALLOWED_WEB_ORIGIN", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
  });

  test("rejects a vercel.app lookalike that isn't actually a vercel.app origin", () => {
    expect(isAllowedOrigin("https://vercel.app.evil.example.com")).toBe(false);
  });
});
