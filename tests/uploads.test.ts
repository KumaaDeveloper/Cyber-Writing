import test from "node:test";
import assert from "node:assert/strict";
import { imageUploadError, MAX_IMAGE_BYTES, MAX_IMAGE_REQUEST_BYTES } from "../lib/uploads";

test("image upload accepts exactly 2 MiB and rejects even one extra byte", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    assert.equal(imageUploadError({ size: MAX_IMAGE_BYTES, type }), null);
    assert.match(imageUploadError({ size: MAX_IMAGE_BYTES + 1, type })!, /maksimal 2 MB/);
  }
  assert.equal(MAX_IMAGE_BYTES, 2097152);
  assert.ok(MAX_IMAGE_REQUEST_BYTES > MAX_IMAGE_BYTES, "multipart headers must fit at the valid file boundary");
});
test("empty images and unsupported file types are rejected", () => {
  assert.ok(imageUploadError({ size: 0, type: "image/png" }));
  assert.ok(imageUploadError({ size: 100, type: "image/svg+xml" }));
  assert.ok(imageUploadError({ size: 100, type: "application/pdf" }));
});
