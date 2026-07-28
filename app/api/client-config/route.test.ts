import { afterEach, describe, expect, it } from "vitest";

const URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const ANON_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const originalUrl = process.env[URL_ENV];
const originalAnonKey = process.env[ANON_KEY_ENV];

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnv(URL_ENV, originalUrl);
  restoreEnv(ANON_KEY_ENV, originalAnonKey);
});

describe("GET /api/client-config", () => {
  it("returns only the public Supabase bootstrap configuration at runtime", async () => {
    process.env[URL_ENV] = "https://demo-project.supabase.co";
    process.env[ANON_KEY_ENV] = "test-public-anon-key";

    const { GET } = await import("@/app/api/client-config/route");
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      configured: true,
      supabase_url: "https://demo-project.supabase.co",
      supabase_anon_key: "test-public-anon-key",
    });
  });

  it("returns a non-cacheable 503 without exposing partial configuration", async () => {
    delete process.env[URL_ENV];
    process.env[ANON_KEY_ENV] = "test-public-anon-key";

    const { GET } = await import("@/app/api/client-config/route");
    const response = GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ configured: false });
  });
});
