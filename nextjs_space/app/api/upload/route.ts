export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveUpload, extensionForContentType, UPLOAD_MAX_BYTES } from "@/lib/s3";

// Local upload endpoint: accepts multipart form data with a single `file`
// field (image only, max 15MB), stores it on the mini's disk, and returns
// the storage key the caller should save (e.g. as portraitPath).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const v = form.get("file");
    if (v instanceof File) file = v;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const ext = extensionForContentType(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Only PNG, JPEG, GIF, WebP images allowed" }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  if (file.size > UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const cloud_storage_path = await saveUpload(bytes, ext);
  return NextResponse.json({ cloud_storage_path });
}
