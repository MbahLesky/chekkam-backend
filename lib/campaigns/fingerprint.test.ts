import { describe, expect, it } from "vitest";
import { extractFingerprint, normalizeCameroonNumber } from "@/lib/campaigns/fingerprint";

describe("normalizeCameroonNumber", () => {
  it("strips whitespace, punctuation, and a leading +237/237", () => {
    expect(normalizeCameroonNumber("+237 677 12 34 56")).toBe("677123456");
    expect(normalizeCameroonNumber("237677123456")).toBe("677123456");
    expect(normalizeCameroonNumber("677-12-34-56")).toBe("677123456");
    expect(normalizeCameroonNumber("677123456")).toBe("677123456");
  });
});

describe("extractFingerprint", () => {
  it("extracts the same phone number the same way regardless of formatting", () => {
    const a = extractFingerprint("Call this MTN agent at +237 677 12 34 56 now.");
    const b = extractFingerprint("Contact 677123456 to complete payment.");
    expect(a.phoneNumbers).toContain("677123456");
    expect(b.phoneNumbers).toContain("677123456");
    expect(a.phoneNumbers).toEqual(b.phoneNumbers);
  });

  it("extracts URLs and dedupes repeats", () => {
    const fp = extractFingerprint("Visit https://example.com/pay and https://example.com/pay again.");
    expect(fp.urls).toEqual(["https://example.com/pay"]);
  });
});
