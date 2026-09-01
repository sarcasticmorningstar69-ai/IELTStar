import { NextResponse } from "next/server";
import type { AiProviderStatus } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

function providerStatus(): AiProviderStatus {
  return {
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    glm: Boolean(process.env.GLM_API_KEY),
    transcriptionModel: process.env.DEEPGRAM_MODEL || "nova-3",
    feedbackModel: process.env.GLM_MODEL || "glm-5.3-flash",
  };
}

export async function GET() {
  return NextResponse.json(providerStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const status = providerStatus();
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");

  // Do not parse or forward audio until the private server-side credentials
  // are present. This keeps the preview shell honest and prevents accidental
  // uploads while the providers are still being chosen.
  if (!status.glm || (isMultipart && !status.deepgram)) {
    const missing = [
      ...(!status.deepgram && isMultipart ? ["Deepgram"] : []),
      ...(!status.glm ? ["GLM"] : []),
    ];
    return NextResponse.json(
      {
        code: "AI_NOT_CONFIGURED",
        message: `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not connected yet. The interface is ready, but no recording or page context was sent to an AI provider.`,
        status,
      },
      { status: 503 }
    );
  }

  // Provider calls intentionally land in the next implementation step, after
  // the user approves this UX and supplies server-side credentials. The final
  // pipeline will be: audio -> Deepgram Nova-3 -> structured transcript and
  // filler timestamps -> GLM rubric feedback -> validated JSON response.
  return NextResponse.json(
    {
      code: "PROVIDER_ADAPTER_PENDING",
      message: "The AI interface is connected to its server route. Provider adapters will be enabled after the review step.",
      status,
    },
    { status: 501 }
  );
}
