export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Allow multipart headers in addition to the file itself.
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
export function imageUploadError(file: { size: number; type: string }): string | null {
  if (file.size > MAX_IMAGE_BYTES) return "Ukuran gambar maksimal 2 MB.";
  if (!file.size || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return "Gunakan gambar JPG, PNG, atau WebP maksimal 2 MB.";
  return null;
}
