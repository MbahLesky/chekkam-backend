import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas ships a native binary (used for OCR page rasterization,
  // lib/ai/ocr.ts) that Turbopack/webpack can't bundle as an ESM chunk —
  // this tells Next.js to require it natively at runtime instead.
  serverExternalPackages: ["@napi-rs/canvas", "@contentauth/c2pa-node"],
};

export default nextConfig;
