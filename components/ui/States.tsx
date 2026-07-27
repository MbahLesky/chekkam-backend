/**
 * Loading / empty / error text states (FR-017/018), lifted from the
 * near-identical `<p className="...">` lines already repeated across
 * app/dashboard/*.tsx so the exact classes stop drifting between call sites.
 */
export function LoadingState({ message }: { message: string }) {
  return <p className="text-sm text-chekkam-muted">{message}</p>;
}

export function EmptyState({ message }: { message: string }) {
  return <p className="p-6 text-center text-sm text-chekkam-muted">{message}</p>;
}

export function ErrorState({ message }: { message: string }) {
  return <p className="text-sm text-status-danger">{message}</p>;
}
