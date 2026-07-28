import { describe, expect, it } from "vitest";
import { registeredSourceMatches } from "@/lib/media/source-verification";

describe("registeredSourceMatches", () => {
  it("matches a registered publisher domain and its subdomains", () => {
    expect(
      registeredSourceMatches(new URL("https://news.example.org/story/42"), "https://example.org")
    ).toBe(true);
  });

  it("does not confuse a lookalike domain with an official domain", () => {
    expect(
      registeredSourceMatches(new URL("https://bbc.com.attacker.example/video"), "https://www.bbc.com")
    ).toBe(false);
  });

  it("pins a registered social account path instead of trusting the whole platform", () => {
    const official = "https://www.tiktok.com/@crtv";
    expect(registeredSourceMatches(new URL("https://www.tiktok.com/@crtv/video/123"), official)).toBe(true);
    expect(registeredSourceMatches(new URL("https://www.tiktok.com/@crtvnews/video/123"), official)).toBe(false);
  });
});
