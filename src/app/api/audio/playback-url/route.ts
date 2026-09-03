import { NextResponse } from "next/server";
import { getAudioPlaybackUrl, isR2Configured } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const recordingId = searchParams.get("id");

    if (!recordingId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (!isR2Configured) {
      return NextResponse.json({ url: null, configured: false });
    }

    const key = `recordings/${recordingId}.webm`;
    const url = await getAudioPlaybackUrl(key);

    return NextResponse.json({ url, configured: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate playback URL" },
      { status: 500 }
    );
  }
}
