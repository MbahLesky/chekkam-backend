import { describe, expect, it } from "vitest";
import { getNumberReputation } from "@/lib/fraud-intelligence/number-reputation";

function makeAdmin(structuredRows: unknown[], fingerprintRows: unknown[] = []) {
  const structuredBuilder: Record<string, unknown> = {
    select: () => structuredBuilder,
    or: () => structuredBuilder,
    limit: async () => ({ data: structuredRows, error: null }),
  };
  const fingerprintBuilder: Record<string, unknown> = {
    select: () => fingerprintBuilder,
    filter: () => fingerprintBuilder,
    limit: async () => ({ data: fingerprintRows, error: null }),
  };
  let call = 0;
  return {
    from: () => {
      call += 1;
      return call === 1 ? structuredBuilder : fingerprintBuilder;
    },
  };
}

describe("getNumberReputation", () => {
  it("reports no_reports for an empty/garbage input without querying anything meaningful", async () => {
    const admin = makeAdmin([]);
    const result = await getNumberReputation(admin as never, "");
    expect(result.status).toBe("no_reports");
    expect(result.report_count).toBe(0);
  });

  it("never claims a number is safe just because nothing was found — status is no_reports, not verified_safe", async () => {
    const admin = makeAdmin([]);
    const result = await getNumberReputation(admin as never, "677123456");
    expect(result.status).toBe("no_reports");
  });

  it("reports confirmed_scam when any matching report reached verified_threat", async () => {
    const admin = makeAdmin([
      { id: "r1", status: "pending", category: "mobile_money_fraud", network_provider: "mtn", created_at: "2026-01-01", campaign_id: null },
      { id: "r2", status: "verified_threat", category: "mobile_money_fraud", network_provider: "mtn", created_at: "2026-01-02", campaign_id: "c1" },
    ]);
    const result = await getNumberReputation(admin as never, "677123456");
    expect(result.status).toBe("confirmed_scam");
    expect(result.report_count).toBe(2);
    expect(result.campaign_ids).toEqual(["c1"]);
  });

  it("reports cleared when every matching report was dismissed/false_report", async () => {
    const admin = makeAdmin([
      { id: "r1", status: "false_report", category: null, network_provider: null, created_at: "2026-01-01", campaign_id: null },
      { id: "r2", status: "dismissed", category: null, network_provider: null, created_at: "2026-01-02", campaign_id: null },
    ]);
    const result = await getNumberReputation(admin as never, "677123456");
    expect(result.status).toBe("cleared");
  });

  it("reports under_review when a report is actively being reviewed", async () => {
    const admin = makeAdmin([
      { id: "r1", status: "under_review", category: null, network_provider: null, created_at: "2026-01-01", campaign_id: null },
    ]);
    const result = await getNumberReputation(admin as never, "677123456");
    expect(result.status).toBe("under_review");
  });

  it("dedupes a report found via both the structured column and the fingerprint search", async () => {
    const row = { id: "r1", status: "pending", category: "mobile_money_fraud", network_provider: "orange", created_at: "2026-01-01", campaign_id: null };
    const admin = makeAdmin([row], [row]);
    const result = await getNumberReputation(admin as never, "677123456");
    expect(result.report_count).toBe(1);
  });
});
