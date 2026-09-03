import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const bucketName = process.env.R2_BUCKET_NAME || "ieltstar-recordings";

export const isR2Configured = Boolean(accountId && accessKeyId && secretAccessKey);

export const r2Client = new S3Client({
  region: "auto",
  endpoint: accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Generate a pre-signed PUT URL so the browser can upload an audio blob
 * directly to Cloudflare R2 without routing through the Next.js server.
 */
export async function getAudioUploadUrl(recordingId: string, mimeType = "audio/webm") {
  if (!isR2Configured) {
    throw new Error("Cloudflare R2 credentials are not configured in environment variables.");
  }

  const key = `recordings/${recordingId}.webm`;
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: mimeType,
  });

  const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
  return { presignedUrl, key };
}

/**
 * Generate a pre-signed GET URL for secure streaming if the bucket is private.
 * If R2_PUBLIC_URL is configured, returns the public CDN URL instead.
 */
export async function getAudioPlaybackUrl(key: string) {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }

  if (!isR2Configured) return null;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}
