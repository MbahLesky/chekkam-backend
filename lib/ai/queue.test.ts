import { describe, expect, it, vi } from "vitest";
import { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob, claimNextJob, completeJob, failJob } from "@/lib/ai/queue";

function mockAdmin(overrides: Partial<Record<string, unknown>> = {}) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: { id: "job-1" }, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  };
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

describe("ai job queue", () => {
  it("enqueueJob inserts a row and returns its id", async () => {
    const admin = mockAdmin();
    const id = await enqueueJob(admin, "media_analysis", { url: "https://x" });
    expect(id).toBe("job-1");
    expect(admin.from).toHaveBeenCalledWith("ai_jobs");
  });

  it("claimNextJob returns null when nothing is pending", async () => {
    const admin = mockAdmin({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    });
    const job = await claimNextJob(admin, "media_analysis");
    expect(job).toBeNull();
  });

  it("claimNextJob claims and marks a pending job as processing", async () => {
    let call = 0;
    const admin = mockAdmin({
      maybeSingle: vi.fn(async () => {
        call += 1;
        return call === 1
          ? { data: { id: "job-1", attempts: 0 }, error: null }
          : { data: { id: "job-1", status: "processing", attempts: 1 }, error: null };
      }),
    });
    const job = await claimNextJob(admin, "media_analysis");
    expect(job?.status).toBe("processing");
    expect(job?.attempts).toBe(1);
  });

  it("completeJob and failJob update status without throwing", async () => {
    const admin = mockAdmin();
    await expect(completeJob(admin, "job-1")).resolves.toBeUndefined();
    await expect(failJob(admin, "job-1", "boom")).resolves.toBeUndefined();
  });
});
