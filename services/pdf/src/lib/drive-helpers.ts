/**
 * Google Drive helper functions for server-side use.
 */
import type { drive_v3 } from "googleapis";

/**
 * List all PDF files in a Google Drive folder (single level).
 */
async function listPdfsInFolder(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const results: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      pageToken,
    });

    for (const f of res.data.files ?? []) {
      if (f.id && f.name) {
        results.push({ id: f.id, name: f.name });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return results;
}

/**
 * List subfolders in a Google Drive folder.
 */
async function listSubfolders(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const results: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 100,
      pageToken,
    });

    for (const f of res.data.files ?? []) {
      if (f.id && f.name) {
        results.push({ id: f.id, name: f.name });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return results;
}

/**
 * List all PDF files in a folder and its immediate subfolders.
 */
export async function listFolderPdfs(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const [rootPdfs, subfolders] = await Promise.all([
    listPdfsInFolder(drive, folderId),
    listSubfolders(drive, folderId),
  ]);

  const subPdfs = await Promise.all(
    subfolders.map((sf) => listPdfsInFolder(drive, sf.id)),
  );

  return [...rootPdfs, ...subPdfs.flat()];
}

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
