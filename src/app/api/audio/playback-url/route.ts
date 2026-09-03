import { NextResponse } from "next/server";
import { getAudioPlaybackUrl, isR2Configured, isSafeId } from "@/lib/storage/r2";
import { getVerifiedUser, unauthenticated } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthenticated("Sign in to play back your recordings.");
  }

  const { searchParams } = new URL(request.url);
  const recordingId = searchParams.get("id") || "";

  if (!recordingId || !isSafeId(recordingId)) {
    return NextResponse.json(
      {
        error: "INVALID_RECORDING_ID",
        message: "id is required and must be alphanumeric.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!isR2Configured) {
    return NextResponse.json(
      { url: null, configured: false },
      { headers: NO_STORE }
    );
  }

  try {
    // Scoped to the verified user, so one student cannot request another's key.
    const url = await getAudioPlaybackUrl(user.id, recordingId);
    return NextResponse.json({ url, configured: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[audio/playback-url] failed to sign playback", error);
    return NextResponse.json(
      {
        error: "PLAYBACK_URL_FAILED",
        message: "Could not load that recording. Please try again.",
      },
      { status: 500, headers: NO_STORE }
    );
  }
}
