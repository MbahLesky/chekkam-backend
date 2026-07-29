import { beforeEach, describe, expect, it, vi } from "vitest";

const fromAsset = vi.fn();

vi.mock("@contentauth/c2pa-node", () => ({
  Reader: { fromAsset },
}));

describe("inspectContentCredentials", () => {
  beforeEach(() => {
    fromAsset.mockReset();
  });

  it("reports a file with no manifest without calling it AI-generated", async () => {
    fromAsset.mockResolvedValue(null);
    const { inspectContentCredentials } = await import("@/lib/media/content-credentials");

    const result = await inspectContentCredentials(Buffer.from("image"), "image/png");

    expect(result.status).toBe("not_present");
    expect(result.detail).toContain("does not mean");
  });

  it("reports a locally validated embedded manifest", async () => {
    fromAsset.mockResolvedValue({
      getActive: () => ({ claim_generator: "Example camera", title: "Photo" }),
      isEmbedded: () => true,
    });
    const { inspectContentCredentials } = await import("@/lib/media/content-credentials");

    const result = await inspectContentCredentials(Buffer.from("image"), "image/jpeg");

    expect(result.status).toBe("verified");
    expect(result.claim_generator).toBe("Example camera");
    expect(result.has_embedded_manifest).toBe(true);
  });

  it("does not claim validity when the verifier reports a warning", async () => {
    fromAsset.mockResolvedValue({
      getActive: () => ({ validation_status: [{ code: "claimSignature.invalid" }] }),
      isEmbedded: () => true,
    });
    const { inspectContentCredentials } = await import("@/lib/media/content-credentials");

    const result = await inspectContentCredentials(Buffer.from("image"), "image/jpeg");

    expect(result.status).toBe("present_with_warnings");
    expect(result.validation_codes).toEqual(["claimSignature.invalid"]);
  });

  it("keeps parser failures distinct from no credentials", async () => {
    fromAsset.mockRejectedValue(new Error("native verifier unavailable"));
    const { inspectContentCredentials } = await import("@/lib/media/content-credentials");

    const result = await inspectContentCredentials(Buffer.from("image"), "image/jpeg");

    expect(result.status).toBe("unavailable");
    expect(result.detail).toContain("No provenance conclusion");
  });
});
