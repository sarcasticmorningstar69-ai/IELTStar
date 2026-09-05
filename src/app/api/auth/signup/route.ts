import { NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, targetBand } = body;

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "Email and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "WEAK_PASSWORD", message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const admin = serviceRoleClient();
    if (!admin) {
      return NextResponse.json(
        { error: "SERVER_CONFIG_ERROR", message: "Auth service is unavailable." },
        { status: 500 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const displayName =
      typeof name === "string" && name.trim()
        ? name.trim()
        : trimmedEmail.split("@")[0];
    const target =
      typeof targetBand === "number" && targetBand >= 4 && targetBand <= 9
        ? targetBand
        : 7.5;

    const { data, error } = await admin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        target_band: target,
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("already registered") ||
        msg.includes("already exists") ||
        msg.includes("duplicate")
      ) {
        return NextResponse.json(
          {
            error: "USER_EXISTS",
            message: "An account with this email already exists. Please sign in instead.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "REGISTRATION_FAILED", message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: data.user.id,
      email: data.user.email,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal registration error.";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
