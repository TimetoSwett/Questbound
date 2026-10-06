// Local-disk file storage for uploads (map images, portraits).
// Replaces the previous S3 presigned-URL flow: the mini has no AWS
// credentials, so uploads are stored under ~/.questbound/uploads and
// served back through /api/files/[...key] (login required).

import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(os.homedir(), ".questbound", "uploads");
}

/** Only keys we generate ourselves are servable: uuid + image extension. */
export function isValidKey(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/.test(key);
}

export function extensionForContentType(contentType: string): string | null {
  return EXT_BY_TYPE[contentType] ?? null;
}

export async function saveUpload(bytes: Uint8Array, ext: string): Promise<string> {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const key = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, key), bytes);
  return key;
}

export async function readUpload(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!isValidKey(key)) return null;
  const ext = key.split(".").pop() ?? "";
  try {
    const bytes = await readFile(path.join(uploadDir(), key));
    return { bytes, contentType: TYPE_BY_EXT[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteUpload(key: string): Promise<void> {
  if (!isValidKey(key)) return;
  try {
    await unlink(path.join(uploadDir(), key));
  } catch {
    /* already gone */
  }
}

// Kept name/signature so existing call sites don't change: now returns a
// same-origin URL served by /api/files/[...key] instead of a signed S3 URL.
export async function getFileUrl(cloud_storage_path: string): Promise<string> {
  const key = cloud_storage_path.split("/").pop() ?? cloud_storage_path;
  return `/api/files/${encodeURIComponent(key)}`;
}
