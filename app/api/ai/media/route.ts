// Backwards-compatible alias for early mobile builds. The former endpoint
// returned simulated video findings; it now delegates to the honest media
// trust-report endpoint instead.
export { POST } from "@/app/api/media/check/route";
