/**
 * Google Drive helper functions for server-side use.
 */
import type { drive_v3 } from "googleapis";

/**
 * Download a file from Google Drive as an ArrayBuffer.
 */
export async function downloadDriveFile(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<ArrayBuffer> {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return res.data as ArrayBuffer;
}
