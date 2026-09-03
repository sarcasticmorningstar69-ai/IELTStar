import { NextResponse } from "next/server";
import {
  getAudioUploadUrl,
  isR2Configured,
  isSafeId,
  MAX_AUDIO_BYTES,
} from "@/lib/storage/r2";
import { getVerifiedUser, unauthenticated } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthenticated("Sign in to save your recordings.");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be JSON." },
      { status: 400, headers: NO_STORE }
    );
  }

  const recordingId =
    typeof body.recordingId === "string" ? body.recordingId : "";
  if (!recordingId || !isSafeId(recordingId)) {
    return NextResponse.json(
      {
        error: "INVALID_RECORDING_ID",
        message: "recordingId is required and must be alphanumeric.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const contentLength =
    typeof body.contentLength === "number" ? body.contentLength : undefined;
  if (contentLength !== undefined && contentLength > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error: "RECORDING_TOO_LARGE",
        message: "That recording is too long to upload. Try a shorter answer.",
        maxBytes: MAX_AUDIO_BYTES,
      },
      { status: 413, headers: NO_STORE }
    );
  }

  if (!isR2Configured) {
    return NextResponse.json(
      {
        configured: false,
        message:
          "Cloudflare R2 is not configured. Audio stays in local IndexedDB.",
      },
      { status: 200, headers: NO_STORE }
    );
  }

  try {
    const mimeType =
      typeof body.mimeType === "string" ? body.mimeType : undefined;

    // The key is derived from the verified user id, never from the request.
    const { presignedUrl, key } = await getAudioUploadUrl(
      user.id,
      recordingId,
      mimeType,
      contentLength
    );

    return NextResponse.json(
      { configured: true, presignedUrl, key },
      { headers: NO_STORE }
    );
  } catch (error) {
    // Log server-side; never return internal messages to the client.
    console.error("[audio/upload-url] failed to sign upload", error);
    return NextResponse.json(
      {
        error: "UPLOAD_URL_FAILED",
        message: "Could not prepare the upload. Please try again.",
      },
      { status: 500, headers: NO_STORE }
    );
  }
}
