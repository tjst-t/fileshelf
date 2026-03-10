export interface Share {
  name: string;
  path: string;
}

export interface FileEntry {
  name: string;
  type: "file" | "dir";
  size: number;
  modified: string;
  perms: string;
}

export interface ApiError {
  error: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export async function fetchShares(): Promise<Share[]> {
  const res = await fetch("/api/shares");
  return handleResponse<Share[]>(res);
}

export async function fetchFiles(path: string): Promise<FileEntry[]> {
  const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
  const data = await handleResponse<{ entries: FileEntry[] }>(res);
  return data.entries;
}

export async function fetchStat(path: string): Promise<FileEntry> {
  const res = await fetch(`/api/files/stat?path=${encodeURIComponent(path)}`);
  return handleResponse<FileEntry>(res);
}

export function downloadUrl(path: string): string {
  return `/api/files/download?path=${encodeURIComponent(path)}`;
}

export function previewUrl(path: string): string {
  return `/api/files/preview?path=${encodeURIComponent(path)}`;
}

export async function uploadFile(path: string, file: File): Promise<void> {
  const res = await fetch(`/api/files/upload?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    body: file,
  });
  await handleResponse(res);
}

export async function createDir(path: string): Promise<void> {
  const res = await fetch("/api/files/mkdir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  await handleResponse(res);
}

export async function deleteFile(path: string): Promise<void> {
  const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
  await handleResponse(res);
}

export async function renameFile(
  path: string,
  dest: string
): Promise<void> {
  const res = await fetch("/api/files/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, dest }),
  });
  await handleResponse(res);
}

export function downloadZipUrl(paths: string[]): string {
  return `/api/files/download-zip?paths=${encodeURIComponent(paths.join(","))}`;
}

export async function copyFile(
  path: string,
  dest: string
): Promise<void> {
  const res = await fetch("/api/files/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, dest }),
  });
  await handleResponse(res);
}
