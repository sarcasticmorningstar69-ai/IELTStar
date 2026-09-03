import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * The publishable (anon) key is designed to be visible in the browser, but the
 * project URL and key are NOT hardcoded here on purpose: a hardcoded fallback
 * means a misconfigured deploy silently "works" against the wrong project
 * instead of failing loudly. Row Level Security is the only thing protecting
 * this data, so configuration mistakes must be noisy.
 */
function readConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (and in your Cloudflare " +
        "environment variables for production)."
    );
  }

  return { url, key };
}

export function createClient() {
  const { url, key } = readConfig();
  return createBrowserClient(url, key);
}

let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (typeof window === "undefined") {
    return createClient();
  }
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
