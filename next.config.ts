import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Note the Permissions-Policy: `microphone=(self)` is required. Omitting the
 * header entirely is permissive, but setting `microphone=()` would silently
 * break every recording feature in the app, so it must stay scoped to self
 * rather than being denied outright.
 *
 * A Content-Security-Policy is deliberately NOT set here yet. Next.js injects
 * inline scripts and styles, so a strict CSP needs nonce plumbing and real
 * testing; a copy-pasted one either breaks the app or is loose enough to be
 * decorative.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",

  // Previously `ignoreBuildErrors: true`, which meant the build never
  // type-checked. A green build proved only that the bundler ran, so real
  // type errors shipped to production unnoticed. Leave this false.
  typescript: {
    ignoreBuildErrors: false,
  },

  // Do not publish browser source maps: they hand out readable application
  // source, including the shape of every API call.
  productionBrowserSourceMaps: false,

  // No need to advertise the framework version to scanners.
  poweredByHeader: false,

  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // API responses must never be cached by the browser or by Cloudflare:
        // they are per-user and include pre-signed URLs.
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
