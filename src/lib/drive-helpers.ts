/**
 * Google Drive helper functions — fetch-based (no googleapis dependency).
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";

interface DriveFile {
  id: string;
  name: string;
}

/**
 * List all PDF files in a Google Drive folder (single level).
 */
async function listPdfsInFolder(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  const results: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive API error: ${res.status}`);

    const data = await res.json() as { files?: DriveFile[]; nextPageToken?: string };
    for (const f of data.files ?? []) {
      if (f.id && f.name) results.push(f);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

/**
 * List subfolders in a Google Drive folder.
 */
async function listSubfolders(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  const results: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive API error: ${res.status}`);

    const data = await res.json() as { files?: DriveFile[]; nextPageToken?: string };
    for (const f of data.files ?? []) {
      if (f.id && f.name) results.push(f);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

/**
 * List all PDF files in a folder and its immediate subfolders.
 */
export async function listFolderPdfs(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  const [rootPdfs, subfolders] = await Promise.all([
    listPdfsInFolder(accessToken, folderId),
    listSubfolders(accessToken, folderId),
  ]);

  const subPdfs = await Promise.all(
    subfolders.map((sf) => listPdfsInFolder(accessToken, sf.id)),
  );

  return [...rootPdfs, ...subPdfs.flat()];
}

/**
 * Download a file from Google Drive as an ArrayBuffer.
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download error: ${res.status}`);
  return res.arrayBuffer();
}
