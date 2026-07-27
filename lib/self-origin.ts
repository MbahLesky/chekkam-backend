import { NextRequest } from "next/server";

/**
 * Base URL for a route to call another route on this SAME running instance
 * (e.g. app/api/partner-demo-proxy/* calling /api/v1/partner/*). Never
 * process.env.APP_BASE_URL — that's the public-facing URL used for QR/
 * webhook links and can point at a different deployed instance.
 *
 * On Railway, `req.nextUrl.origin` reflects the public https:// scheme
 * (rewritten from the edge's forwarded headers), but a same-instance fetch
 * from inside the container to its own public HTTPS hostname hairpins
 * through Railway's edge in a way that fails with a TLS version mismatch
 * (`ERR_SSL_WRONG_VERSION_NUMBER`) — confirmed live. `RAILWAY_PRIVATE_DOMAIN`
 * is Railway's own private network hostname for exactly this case, routed
 * over plain HTTP. Falls back to the request's own origin for local dev,
 * where there is no private domain and localhost already works.
 */
export function getSelfOrigin(req: NextRequest): string {
  const privateDomain = process.env.RAILWAY_PRIVATE_DOMAIN;
  // The private domain routes to whatever port this service actually listens
  // on, not 80 — a bare http://<domain> with no port was confirmed live to
  // fail with ECONNREFUSED. Next.js's own startup log ("Network: http://
  // <ip>:8080") is the source of truth for the port; process.env.PORT is not
  // set at runtime the same way `railway run` reports it.
  const port = process.env.PORT ?? "8080";
  return privateDomain ? `http://${privateDomain}:${port}` : req.nextUrl.origin;
}
