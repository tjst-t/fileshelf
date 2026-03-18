import type { UploadItem } from "../hooks/useFileExplorer";

interface CapturedDrop {
  entries: FileSystemEntry[];
  files: File[];
}

/**
 * Capture drag data synchronously during the drop event.
 * Must be called synchronously inside the drop event handler before any async work,
 * because the DataTransfer object becomes unavailable after the event handler returns.
 */
export function captureDrop(dataTransfer: DataTransfer): CapturedDrop {
  const entries: FileSystemEntry[] = [];
  const files: File[] = [];

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        entries.push(entry);
      } else {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }

  // Also capture from files list as fallback
  if (entries.length === 0 && files.length === 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      files.push(dataTransfer.files[i]);
    }
  }

  return { entries, files };
}

/**
 * Process captured drop data into UploadItems.
 * This can be called asynchronously after the drop event handler returns.
 */
export async function processDropItems(captured: CapturedDrop): Promise<UploadItem[]> {
  const items: UploadItem[] = [];

  // If we got FileSystemEntry objects, traverse them (supports folders)
  if (captured.entries.length > 0) {
    for (const entry of captured.entries) {
      try {
        await traverseEntry(entry, "", items);
      } catch {
        // If traversal fails for a file entry, add it as raw file
        if (entry.isFile) {
          try {
            const file = await getFile(entry as FileSystemFileEntry);
            items.push({ file, relativePath: entry.name });
          } catch {
            // Skip entries we can't read
          }
        }
      }
    }
    if (items.length > 0) return items;
  }

  // Fallback: use raw File objects (no folder traversal)
  for (const file of captured.files) {
    if (isLikelyDirectory(file)) continue;
    items.push({ file, relativePath: file.name });
  }
  return items;
}

/**
 * Convenience: capture + process in one call.
 * The capture part runs synchronously, the processing part is async.
 */
export async function extractDropItems(dataTransfer: DataTransfer): Promise<UploadItem[]> {
  const captured = captureDrop(dataTransfer);
  return processDropItems(captured);
}

/**
 * Heuristic to detect if a File object represents a directory.
 * Directories dropped from the OS typically have type="" and size=0.
 */
function isLikelyDirectory(file: File): boolean {
  return file.type === "" && file.size === 0;
}

async function traverseEntry(
  entry: FileSystemEntry,
  basePath: string,
  items: UploadItem[]
): Promise<void> {
  const path = basePath ? basePath + "/" + entry.name : entry.name;

  if (entry.isFile) {
    const file = await getFile(entry as FileSystemFileEntry);
    items.push({ file, relativePath: path });
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(dirReader);
    for (const child of entries) {
      await traverseEntry(child, path, items);
    }
  }
}

function getFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all);
        } else {
          all.push(...entries);
          readBatch(); // readEntries may return partial results
        }
      }, reject);
    };
    readBatch();
  });
}
