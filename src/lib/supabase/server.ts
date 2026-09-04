import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://itasbwvtdngcnwtntvch.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YXNid3Z0ZG5nY253dG50dmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNTgzNjMsImV4cCI6MjEwMzYzNDM2M30.M6rO9H5k7c3BLnt0FhWfrMPMiklz8hK7i5gMg3wD09s";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const isServiceRoleConfigured = Boolean(
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
);

export type VerifiedUser = {
  id: string;
  email: string | null;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Resolve the caller's identity by validating their Supabase JWT.
 *
 * Always uses `auth.getUser()`, which verifies the token against the Supabase
 * auth server. Never use `auth.getSession()` for authorisation decisions: it
 * reads whatever is in storage without checking the signature, so a forged
 * value would be accepted.
 *
 * Accepts either an `Authorization: Bearer <token>` header or the session
 * cookies set by `@supabase/ssr` on the browser client.
 *
 * @returns the verified user, or null if the caller is not authenticated.
 */
export async function getVerifiedUser(
  request: Request
): Promise<VerifiedUser | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const token = bearerToken(request);
  if (token) {
    const client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  }

  try {
    const cookieStore = await cookies();
    const client = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Route handlers here only read the session; they never refresh it.
        setAll: () => {},
      },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/**
 * Service-role client. Bypasses RLS, so it must only ever be constructed in
 * server-side code and never returned to the browser.
 */
export function serviceRoleClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function unauthenticated(message = "Sign in to continue.") {
  return NextResponse.json(
    { error: "UNAUTHENTICATED", message },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}
