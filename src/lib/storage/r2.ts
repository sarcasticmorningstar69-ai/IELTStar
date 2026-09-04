import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const bucketName = process.env.R2_BUCKET_NAME || "ieltstar-recordings";
export const isR2Configured = Boolean(accountId && accessKeyId && secretAccessKey);

/** 15 MiB leaves headroom for a 20-minute, 64 kbps recording and browsers that overshoot the requested bitrate. */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 20 * 60;

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/mp4", "audio/mpeg",
]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const r2Client = new S3Client({
  region: "auto",
  endpoint: accountId
    ? "https://" + accountId + ".r2.cloudflarestorage.com"
    : undefined,
  credentials: { accessKeyId, secretAccessKey },
});

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
  return mimeType && ALLOWED_MIME_TYPES.has(mimeType) ? mimeType : "audio/webm";
}

export async function getAudioUploadUrl(
  userId: string,
  recordingId: string,
  mimeType?: string,
  contentLength?: number
) {
  if (!isR2Configured) throw new Error("Cloudflare R2 credentials are not configured.");
  if (contentLength !== undefined) {
    if (!Number.isFinite(contentLength) || contentLength <= 0) throw new Error("Invalid contentLength.");
    if (contentLength > MAX_AUDIO_BYTES) throw new Error("Recording exceeds the maximum upload size.");
  }
  const key = audioKey(userId, recordingId);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: normaliseMimeType(mimeType),
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
  });
  return { presignedUrl: await getSignedUrl(r2Client, command, { expiresIn: 300 }), key };
}

export async function uploadAudioDirect(
  userId: string,
  recordingId: string,
  buffer: Uint8Array | Buffer,
  mimeType?: string
): Promise<string | null> {
  if (!isR2Configured) return null;
  const key = audioKey(userId, recordingId);
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: normaliseMimeType(mimeType),
      Body: buffer,
    })
  );
  return key;
}

export async function getAudioPlaybackUrl(userId: string, recordingId: string): Promise<string | null> {
  if (!isR2Configured) return null;
  return getSignedUrl(r2Client, new GetObjectCommand({
    Bucket: bucketName,
    Key: audioKey(userId, recordingId),
  }), { expiresIn: 3600 });
}

export async function deleteAudioObject(userId: string, recordingId: string): Promise<void> {
  if (!isR2Configured) return;
  await r2Client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: audioKey(userId, recordingId),
  }));
}
