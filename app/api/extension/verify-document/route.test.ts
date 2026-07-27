import { describe, test, expect, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ default: { lookup: lookupMock } }));

import { isPrivateIp, assertPubliclyFetchable } from "./route";

describe("isPrivateIp", () => {
  test.each([
    ["10.0.0.5", true],
    ["127.0.0.1", true],
    ["169.254.169.254", true], // cloud metadata endpoint
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.1.1", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["93.184.216.34", false],
    ["172.15.0.1", false], // just outside the 172.16-31 private range
    ["172.32.0.1", false],
  ])("%s -> private=%s", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  test("flags IPv6 loopback and link-local/unique-local ranges", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12::1")).toBe(true);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false); // public (Google DNS)
  });
});

describe("assertPubliclyFetchable — SSRF guard", () => {
  test("rejects a malformed URL", async () => {
    await expect(assertPubliclyFetchable("not a url")).rejects.toThrow();
  });

  test("rejects non-http(s) protocols", async () => {
    await expect(assertPubliclyFetchable("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPubliclyFetchable("ftp://example.com/file.pdf")).rejects.toThrow();
  });

  test("rejects the blocked hostnames directly, without a DNS lookup", async () => {
    await expect(assertPubliclyFetchable("http://localhost/secret")).rejects.toThrow();
    await expect(
      assertPubliclyFetchable("http://chekkam-backend.railway.internal:8080/secret")
    ).rejects.toThrow();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  test("rejects a hostname that resolves to a private/internal IP", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertPubliclyFetchable("http://metadata.internal-attacker.example/x")).rejects.toThrow();
  });

  test("rejects when DNS resolution fails entirely", async () => {
    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(assertPubliclyFetchable("http://does-not-resolve.example/x")).rejects.toThrow();
  });

  test("allows a hostname that resolves to a public IP", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    const url = await assertPubliclyFetchable("https://example.com/certificate.pdf");
    expect(url.hostname).toBe("example.com");
  });
});
