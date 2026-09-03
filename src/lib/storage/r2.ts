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

/** Hard ceiling on a single recording. ~10 MB is around 50 minutes of Opus speech. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Hard ceiling on a single recording's duration, enforced before transcription. */
export const MAX_AUDIO_SECONDS = 5 * 60;

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
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Identifiers that are safe to interpolate into an object key. Rejects "..",
 * slashes and anything else that could escape the caller's own prefix.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}

/**
 * Build the object key for a recording.
 *
 * Ownership is enforced structurally: the key always contains the *verified*
 * user id, so a caller cannot address another student's audio no matter what
 * recording id they supply. Never build a key from a client-supplied path.
 */
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

/**
 * Pre-signed PUT URL so the browser uploads straight to R2 without the audio
 * passing through the Worker.
 *
 * When `contentLength` is supplied it is bound into the signature, so the
 * client cannot upload something larger than it declared.
 */
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

  const presignedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 300,
  });
  return { presignedUrl, key };
}

/**
 * Pre-signed GET URL for playback.
 *
 * There is deliberately no public-CDN branch here. Serving these objects from
 * a public R2 bucket URL would make every student's voice recording readable
 * by anyone who can guess a key, which is exactly what the user-scoped key and
 * the auth check on the route exist to prevent. Keep the bucket private.
 */
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
