import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const bucketName = process.env.R2_BUCKET_NAME || "ieltstar-recordings";

export const isR2Configured = Boolean(
  accountId && accessKeyId && secretAccessKey
);

/** Hard ceiling on a single recording. 10 MB comfortably covers a 20-minute Opus mock. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** One complete IELTS mock can run beyond the nominal test time with transitions. */
export const MAX_AUDIO_SECONDS = 20 * 60;

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
]);

export const r2Client = new S3Client({
  region: "auto",
  endpoint: accountId
    ? "https://" + accountId + ".r2.cloudflarestorage.com"
    : undefined,
  credentials: { accessKeyId, secretAccessKey },
});

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}

export function audioKey(userId: string, recordingId: string): string {
  if (!isSafeId(userId) || !isSafeId(recordingId)) {
    throw new Error("Unsafe identifier rejected while building an object key.");
  }
  return "recordings/" + userId + "/" + recordingId + ".webm";
}

export function normaliseMimeType(mimeType?: string | null): string {
  if (mimeType && ALLOWED_MIME_TYPES.has(mimeType)) return mimeType;
  return "audio/webm";
}

export async function getAudioUploadUrl(
  userId: string,
  recordingId: string,
  mimeType?: string,
  contentLength?: number
) {
  if (!isR2Configured) {
    throw new Error(
      "Cloudflare R2 credentials are not configured in environment variables."
    );
  }

  if (contentLength !== undefined) {
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      throw new Error("Invalid contentLength.");
    }
    if (contentLength > MAX_AUDIO_BYTES) {
      throw new Error("Recording exceeds the maximum upload size.");
    }
  }

  const key = audioKey(userId, recordingId);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: normaliseMimeType(mimeType),
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
  });

  const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
  return { presignedUrl, key };
}

export async function getAudioPlaybackUrl(
  userId: string,
  recordingId: string
): Promise<string | null> {
  if (!isR2Configured) return null;
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: audioKey(userId, recordingId),
  });
  return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

export async function deleteAudioObject(
  userId: string,
  recordingId: string
): Promise<void> {
  if (!isR2Configured) return;
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: audioKey(userId, recordingId),
    })
  );
}
