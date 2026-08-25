import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_REELS_STORAGE_BUCKET } from "@avaliacoes/shared";

export type ReelStorageProvider = "supabase" | "r2";

export interface StoredReelVideo {
  url: string;
  path: string;
  provider: ReelStorageProvider;
}

export async function uploadReelVideo(
  admin: SupabaseClient,
  input: {
    storeId: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  }
): Promise<StoredReelVideo> {
  const ext = safeVideoExtension(input.fileName, input.mimeType);
  const path = `stores/${input.storeId}/reels/${crypto.randomUUID()}.${ext}`;

  if (r2Configured()) {
    await r2Request({
      method: "PUT",
      key: path,
      body: input.buffer,
      contentType: input.mimeType,
    });
    return {
      url: `${r2PublicUrl()}/${path}`,
      path,
      provider: "r2",
    };
  }

  const { error } = await admin.storage
    .from(PRODUCT_REELS_STORAGE_BUCKET)
    .upload(path, input.buffer, {
      contentType: input.mimeType,
      upsert: false,
    });
  if (error) throw new Error(storageErrorMessage(error.message));

  const { data } = admin.storage
    .from(PRODUCT_REELS_STORAGE_BUCKET)
    .getPublicUrl(path);
  return { url: data.publicUrl, path, provider: "supabase" };
}

export async function removeReelVideo(
  admin: SupabaseClient,
  provider: ReelStorageProvider | string | null | undefined,
  path: string | null | undefined
) {
  if (!path) return;
  if (provider === "r2" && r2Configured()) {
    await r2Request({ method: "DELETE", key: path }).catch(() => {});
    return;
  }
  await admin.storage
    .from(PRODUCT_REELS_STORAGE_BUCKET)
    .remove([path])
    .catch(() => {});
}

function safeVideoExtension(name: string, mime: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && ["mp4", "webm", "mov"].includes(ext)) return ext;
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "mp4";
}

function storageErrorMessage(message: string): string {
  if (message.toLowerCase().includes(PRODUCT_REELS_STORAGE_BUCKET)) {
    return "Execute a migration 0015_product_reels.sql no Supabase";
  }
  return message;
}

function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_URL
  );
}

function r2PublicUrl(): string {
  return String(process.env.R2_PUBLIC_URL).replace(/\/+$/, "");
}

function r2Config() {
  return {
    accountId: String(process.env.R2_ACCOUNT_ID),
    accessKeyId: String(process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: String(process.env.R2_SECRET_ACCESS_KEY),
    bucket: String(process.env.R2_BUCKET),
  };
}

async function r2Request({
  method,
  key,
  body,
  contentType,
}: {
  method: "PUT" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
}) {
  const config = r2Config();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePathSegment(config.bucket)}/${key
    .split("/")
    .map(encodePathSegment)
    .join("/")}`;
  const url = `https://${host}${canonicalUri}`;
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(signingKey(config.secretAccessKey, dateStamp), stringToSign);
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const requestBody = method === "PUT" ? (payload as unknown as BodyInit) : undefined;
  const response = await fetch(url, {
    method,
    headers: { ...headers, authorization },
    body: requestBody,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Falha ao enviar arquivo para Cloudflare R2 (${response.status})`);
  }
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: string | Buffer, value: string): string {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function signingKey(secret: string, dateStamp: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}
