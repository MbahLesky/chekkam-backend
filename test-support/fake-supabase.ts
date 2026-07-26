import type { SupabaseClient } from "@supabase/supabase-js";

type CannedResult = { data: unknown; error?: unknown };

/**
 * Minimal stand-in for the subset of the Supabase query builder this
 * codebase actually uses (.select/.eq/.or/.maybeSingle/.single/.insert),
 * so lib/documents/* and lib/auth.ts logic can be unit-tested without a
 * live database. Configure one canned result per table (or an array of
 * results for tables queried more than once in a single test).
 */
export function fakeSupabase(tableResults: Record<string, CannedResult | CannedResult[]>): SupabaseClient {
  const callIndex: Record<string, number> = {};

  function resultFor(table: string): Promise<CannedResult> {
    const configured = tableResults[table];
    if (Array.isArray(configured)) {
      const idx = callIndex[table] ?? 0;
      callIndex[table] = idx + 1;
      return Promise.resolve(configured[idx] ?? { data: null, error: null });
    }
    return Promise.resolve(configured ?? { data: null, error: null });
  }

  function builder(table: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      in: () => chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => resultFor(table),
      single: () => resultFor(table),
    };
    return chain;
  }

  return { from: builder } as unknown as SupabaseClient;
}

/** A fake client whose .from() throws — proves a code path never queries the database. */
export function unreachableSupabase(): SupabaseClient {
  return {
    from() {
      throw new Error("unreachable: this code path must not query the database");
    },
  } as unknown as SupabaseClient;
}
