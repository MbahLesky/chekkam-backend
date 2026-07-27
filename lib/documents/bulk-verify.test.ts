import { describe, test, expect, vi } from "vitest";
import { parseVerificationIdList, runBulkVerification, MAX_BULK_ROWS } from "./bulk-verify";
import { ValidationError } from "@/lib/errors";

describe("parseVerificationIdList", () => {
  test("splits one ID per line, trims whitespace, skips blank lines", () => {
    expect(parseVerificationIdList("CHK-AAAA-1111\n  CHK-BBBB-2222  \n\nCHK-CCCC-3333")).toEqual([
      "CHK-AAAA-1111",
      "CHK-BBBB-2222",
      "CHK-CCCC-3333",
    ]);
  });

  test("takes only the first CSV column per row", () => {
    expect(parseVerificationIdList("CHK-AAAA-1111,Jane Doe\nCHK-BBBB-2222,John Smith")).toEqual([
      "CHK-AAAA-1111",
      "CHK-BBBB-2222",
    ]);
  });

  test("drops a recognizable header row", () => {
    expect(parseVerificationIdList("verification_id\nCHK-AAAA-1111")).toEqual(["CHK-AAAA-1111"]);
    expect(parseVerificationIdList("ID\nCHK-AAAA-1111")).toEqual(["CHK-AAAA-1111"]);
  });

  test("throws a ValidationError for an empty file", () => {
    expect(() => parseVerificationIdList("\n\n  \n")).toThrow(ValidationError);
  });

  test("throws a ValidationError past the row cap", () => {
    const tooMany = Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => `CHK-${i}`).join("\n");
    expect(() => parseVerificationIdList(tooMany)).toThrow(ValidationError);
  });

  test("accepts exactly the row cap", () => {
    const exactly = Array.from({ length: MAX_BULK_ROWS }, (_, i) => `CHK-${i}`).join("\n");
    expect(parseVerificationIdList(exactly)).toHaveLength(MAX_BULK_ROWS);
  });
});

describe("runBulkVerification", () => {
  test("runs each row through the shared verify engine and numbers rows from 1", async () => {
    const docBuilder = {
      select: vi.fn(() => docBuilder),
      or: vi.fn(() => docBuilder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })), // every row -> not_found
    };
    const admin = {
      from: vi.fn((table: string) =>
        table === "document_verification_logs" ? { insert: vi.fn(async () => ({})) } : docBuilder
      ),
    };

    const results = await runBulkVerification(admin as never, ["CHK-AAAA-1111", "CHK-BBBB-2222"]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ row: 1, verification_id_attempted: "CHK-AAAA-1111", status: "not_found" });
    expect(results[1]).toMatchObject({ row: 2, verification_id_attempted: "CHK-BBBB-2222", status: "not_found" });
  });
});
