import { useState, useCallback, useEffect } from "react";
import type { Share, FileEntry } from "../api/client";
import {
  fetchShares,
  fetchFiles,
  createDir,
  deleteFile,
  renameFile,
  copyFile,
  uploadFile,
} from "../api/client";

export interface ClipboardState {
  entries: { name: string; path: string }[];
  mode: "copy" | "cut";
}

export function useFileExplorer() {
  const [shares, setShares] = useState<Share[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadShares = useCallback(async () => {
    try {
      const data = await fetchShares();
      setShares(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const navigate = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const data = await fetchFiles(path);
      setEntries(data);
      setCurrentPath(path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const goUp = useCallback(() => {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length <= 1) {
      setCurrentPath("");
      setEntries([]);
      return;
    }
    parts.pop();
    navigate("/" + parts.join("/"));
  }, [currentPath, navigate]);

  const refresh = useCallback(() => {
    if (currentPath) navigate(currentPath);
  }, [currentPath, navigate]);

  const toggleSelect = useCallback((name: string, multi: boolean) => {
    setSelected((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(entries.map((e) => e.name)));
  }, [entries]);

  const selectRange = useCallback(
    (name: string) => {
      setSelected((prev) => {
        const names = entries.map((e) => e.name);
        if (prev.size === 0) return new Set([name]);
        const last = Array.from(prev).pop()!;
        const from = names.indexOf(last);
        const to = names.indexOf(name);
        if (from === -1 || to === -1) return new Set([name]);
        const [s, e] = from < to ? [from, to] : [to, from];
        return new Set([...prev, ...names.slice(s, e + 1)]);
      });
    },
    [entries]
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (selected.size === 0) return;
    setClipboard({
      entries: Array.from(selected).map((name) => ({
        name,
        path: currentPath + "/" + name,
      })),
      mode: "copy",
    });
    showToast(`${selected.size} item(s) copied`);
  }, [selected, currentPath, showToast]);

  const handleCut = useCallback(() => {
    if (selected.size === 0) return;
    setClipboard({
      entries: Array.from(selected).map((name) => ({
        name,
        path: currentPath + "/" + name,
      })),
      mode: "cut",
    });
    showToast(`${selected.size} item(s) cut`);
  }, [selected, currentPath, showToast]);

  const handlePaste = useCallback(async () => {
    if (!clipboard) return;
    try {
      for (const entry of clipboard.entries) {
        const dest = currentPath + "/" + entry.name;
        if (clipboard.mode === "copy") {
          await copyFile(entry.path, dest);
        } else {
          await renameFile(entry.path, dest);
        }
      }
      if (clipboard.mode === "cut") setClipboard(null);
      showToast("Paste complete");
      refresh();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }, [clipboard, currentPath, refresh, showToast]);

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;
    for (const name of selected) {
      try {
        await deleteFile(currentPath + "/" + name);
      } catch (e) {
        showToast((e as Error).message, "error");
        return;
      }
    }
    showToast(`${selected.size} item(s) deleted`);
    setSelected(new Set());
    refresh();
  }, [selected, currentPath, refresh, showToast]);

  const handleMkdir = useCallback(
    async (name: string) => {
      try {
        await createDir(currentPath + "/" + name);
        showToast(`Created folder: ${name}`);
        refresh();
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    },
    [currentPath, refresh, showToast]
  );

  const handleRename = useCallback(
    async (oldName: string, newName: string) => {
      try {
        await renameFile(currentPath + "/" + oldName, currentPath + "/" + newName);
        showToast(`Renamed: ${oldName} → ${newName}`);
        refresh();
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    },
    [currentPath, refresh, showToast]
  );

  const handleUpload = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        try {
          await uploadFile(currentPath + "/" + file.name, file);
        } catch (e) {
          showToast((e as Error).message, "error");
          return;
        }
      }
      showToast(`${files.length} file(s) uploaded`);
      refresh();
    },
    [currentPath, refresh, showToast]
  );

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  return {
    shares,
    currentPath,
    entries,
    selected,
    loading,
    error,
    clipboard,
    toast,
    navigate,
    goUp,
    refresh,
    toggleSelect,
    selectRange,
    selectAll,
    clearSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleMkdir,
    handleRename,
    handleUpload,
    clearClipboard,
  };
}
