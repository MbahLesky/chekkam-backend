import { vi } from "vitest";

/**
 * Minimal chainable fake for the subset of the Supabase query builder this
 * repo's `lib/`/`app/api` code actually uses (.from().select/insert/update()
 * .eq/order/limit()... .single()/maybeSingle()). Not a general-purpose mock —
 * just enough surface for Phase 1 AI foundation tests.
 */
export function createMockSupabase(responses: {
  select?: { data: unknown; error: unknown };
  insert?: { data: unknown; error: unknown };
  update?: { data: unknown; error: unknown };
}) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.single = vi.fn(async () => responses.insert ?? responses.select ?? { data: null, error: null });
  builder.maybeSingle = vi.fn(
    async () => responses.select ?? responses.insert ?? { data: null, error: null }
  );
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(responses.select ?? { data: [], error: null }).then(resolve);

  return {
    from: vi.fn(() => builder),
  };
}
