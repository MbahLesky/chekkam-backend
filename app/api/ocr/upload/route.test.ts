import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, limit: 10 })),
}));

vi.mock("@/lib/auth", () => ({
  resolveOptionalUserId: vi.fn(async () => null),
}));

const fileTypeFromBuffer = vi.fn();
vi.mock("file-type", () => ({
  fileTypeFromBuffer: (...args: unknown[]) => fileTypeFromBuffer(...args),
}));

vi.mock("@/lib/ai/ocr", () => ({
  extractText: vi.fn(async () => ({ status: "done", extracted_text: "hi", confidence: "high", source: "vision_ai", processingTimeMs: 5 })),
}));

const uploadMock = vi.fn(async () => ({ error: null }));
const insertBuilder = {
  select: vi.fn(function (this: unknown) {
    return this;
  }),
  single: vi.fn(async () => ({ data: { id: "evidence-1" }, error: null })),
};
const fromMock = vi.fn(() => ({ insert: vi.fn(() => insertBuilder) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
    storage: { from: () => ({ upload: uploadMock }) },
  }),
}));

function makeRequestWithFile(file: File): NextRequest {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest("http://localhost/api/ocr/upload", { method: "POST", body: form });
}

describe("POST /api/ocr/upload", () => {
  beforeEach(() => {
    fileTypeFromBuffer.mockReset();
  });

  it("rejects a file over the 10MB limit", async () => {
    const bigBytes = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([bigBytes], "big.png", { type: "image/png" });

    const { POST } = await import("@/app/api/ocr/upload/route");
    const res = await POST(makeRequestWithFile(file));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.field).toBe("file");
  });

  it("rejects a file whose real magic bytes don't match an allowed type, even with a spoofed Content-Type", async () => {
    fileTypeFromBuffer.mockResolvedValue({ mime: "application/x-msdownload", ext: "exe" });
    const file = new File([new Uint8Array([1, 2, 3])], "totally-a.png", { type: "image/png" });

    const { POST } = await import("@/app/api/ocr/upload/route");
    const res = await POST(makeRequestWithFile(file));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.field).toBe("file");
  });

  it("accepts a valid PNG and returns the created evidence row", async () => {
    fileTypeFromBuffer.mockResolvedValue({ mime: "image/png", ext: "png" });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });

    const { POST } = await import("@/app/api/ocr/upload/route");
    const res = await POST(makeRequestWithFile(file));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe("evidence-1");
  });
});
