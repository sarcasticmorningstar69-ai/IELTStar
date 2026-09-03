import { NextResponse } from "next/server";
import { getAudioUploadUrl, isR2Configured } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { recordingId, mimeType } = await request.json();

    if (!recordingId) {
      return NextResponse.json(
        { error: "recordingId is required" },
        { status: 400 }
      );
    }

    if (!isR2Configured) {
      return NextResponse.json(
        {
          configured: false,
          message: "Cloudflare R2 is not yet configured with API credentials. Audio remains stored in local IndexedDB.",
        },
        { status: 200 }
      );
    }

    const { presignedUrl, key } = await getAudioUploadUrl(recordingId, mimeType || "audio/webm");

    return NextResponse.json({
      configured: true,
      presignedUrl,
      key,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
