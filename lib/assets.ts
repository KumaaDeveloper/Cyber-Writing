import { v2 as cloudinary } from "cloudinary";
import { rows, sql, type Executor } from "./db";
export async function queueAssetDeletion(submissionId: string, tx: Executor) {
  await rows(
    sql`INSERT INTO asset_deletion_jobs(storage_key) SELECT storage_key FROM uploaded_assets WHERE submission_id=${submissionId} ON CONFLICT DO NOTHING`,
    tx,
  );
}
export async function cleanDeletedAssets() {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  )
    return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  const jobs = await rows(
    sql`SELECT storage_key FROM asset_deletion_jobs ORDER BY created_at LIMIT 100`,
  );
  if (!jobs.length) return;
  const result = await cloudinary.api.delete_resources(
    jobs.map((j) => j.storage_key),
    { resource_type: "image", type: "upload", invalidate: true },
  );
  for (const [key, state] of Object.entries(result.deleted || {}))
    if (state === "deleted" || state === "not_found")
      await rows(sql`DELETE FROM asset_deletion_jobs WHERE storage_key=${key}`);
}
