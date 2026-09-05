import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://itasbwvtdngcnwtntvch.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YXNid3Z0ZG5nY253dG50dmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNTgzNjMsImV4cCI6MjEwMzYzNDM2M30.M6rO9H5k7c3BLnt0FhWfrMPMiklz8hK7i5gMg3wD09s";

  if (code) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              /* ignore in server component contexts */
            }
          },
        },
      });

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch (err) {
      console.error("Auth callback code exchange error:", err);
    }
  }

  // If no code or error, redirect back to home
  return NextResponse.redirect(`${origin}`);
}
