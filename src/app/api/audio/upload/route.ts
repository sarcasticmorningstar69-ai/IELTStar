import { NextResponse } from "next/server";
import { isR2Configured, isSafeId, uploadAudioDirect, MAX_AUDIO_BYTES } from "@/lib/storage/r2";
import { getVerifiedUser, unauthenticated } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthenticated("Sign in to save your recordings.");
  }

  if (!isR2Configured) {
    return NextResponse.json(
      { configured: false, message: "Cloudflare R2 is not configured. Audio stays in local IndexedDB." },
      { status: 200, headers: NO_STORE }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "INVALID_FORM_DATA", message: "Request body must be multipart form data." },
      { status: 400, headers: NO_STORE }
    );
  }

  const recordingId = formData.get("recordingId");
  if (typeof recordingId !== "string" || !recordingId || !isSafeId(recordingId)) {
    return NextResponse.json(
      { error: "INVALID_RECORDING_ID", message: "recordingId is required and must be alphanumeric." },
      { status: 400, headers: NO_STORE }
    );
  }

  const audioEntry = formData.get("audio");
  if (!(audioEntry instanceof Blob)) {
    return NextResponse.json(
      { error: "MISSING_AUDIO", message: "Audio file is required." },
      { status: 400, headers: NO_STORE }
    );
  }

  if (audioEntry.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "RECORDING_TOO_LARGE", message: "Recording exceeds the maximum upload size." },
      { status: 413, headers: NO_STORE }
    );
  }

  try {
    const arrayBuffer = await audioEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = audioEntry.type || (formData.get("mimeType") as string) || "audio/webm";

    const key = await uploadAudioDirect(user.id, recordingId, buffer, mimeType);

    return NextResponse.json(
      { success: true, key },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    console.error("[audio/upload] direct R2 upload failed", error);
    return NextResponse.json(
      { error: "UPLOAD_FAILED", message: "Could not save recording to cloud storage." },
      { status: 500, headers: NO_STORE }
    );
  }
}
