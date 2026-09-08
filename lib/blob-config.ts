export function blobToken() {
  // Never allow preview cleanup or uploads to touch the production bucket.
  if (process.env.VERCEL_ENV === "preview") {
    if (!process.env.STAGING_READ_WRITE_TOKEN) throw new Error("isolated_preview_blob_required");
    return process.env.STAGING_READ_WRITE_TOKEN;
  }
  return process.env.BLOB_READ_WRITE_TOKEN;
}
