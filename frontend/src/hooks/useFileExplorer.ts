import { useState, useCallback, useEffect, useRef } from "react";
import type { Share, FileEntry, SearchResultEntry } from "../api/client";
import {
  fetchShares,
  fetchFiles,
  createDir,
  deleteFile,
  renameFile,
  copyFile,
  uploadFileWithProgress,
  searchFiles,
} from "../api/client";

export interface UploadProgress {
  name: string;
  size: number;
  loaded: number;
  status: "uploading" | "done" | "error";
  error?: string;
  abort?: () => void;
}

export interface UploadItem {
  file: File;
  relativePath: string;
}

export interface ClipboardState {
  entries: { name: string; path: string }[];
  mode: "copy" | "cut";
}

const SEARCH_HASH_PREFIX = "#search:";

function getPathFromHash(): string {
  const hash = window.location.hash;
  if (!hash || hash === "#" || hash === "#/") return "";
  if (hash.startsWith(SEARCH_HASH_PREFIX)) return ""; // search hash handled separately
  return decodeURIComponent(hash.slice(1)); // remove leading '#'
}

function getSearchFromHash(): string {
  const hash = window.location.hash;
  if (hash.startsWith(SEARCH_HASH_PREFIX)) {
    return decodeURIComponent(hash.slice(SEARCH_HASH_PREFIX.length));
  }
  return "";
}

export function useFileExplorer() {
  const [shares, setShares] = useState<Share[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const isPopState = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultEntry[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchQueryRef = useRef("");
  const searchActiveRef = useRef(false);

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

  const handleSearch = useCallback(async (query: string, pushHistory = false) => {
    setSearchQuery(query);
    searchQueryRef.current = query;
    if (!query || query.length < 2) {
      setSearchResults(null);
      searchActiveRef.current = false;
      return;
    }
    setSearchLoading(true);
    try {
      const data = await searchFiles(query);
      setSearchResults(data.results);
      searchActiveRef.current = true;
      setSelected(new Set());
      if (pushHistory && !isPopState.current) {
        window.history.pushState(null, "", SEARCH_HASH_PREFIX + encodeURIComponent(query));
      }
      isPopState.current = false;
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSearchLoading(false);
    }
  }, [showToast]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults(null);
    searchQueryRef.current = "";
    searchActiveRef.current = false;
  }, []);

  const navigate = useCallback(async (path: string) => {
    // If leaving search mode, save search to history so the user can go back
    if (searchActiveRef.current && searchQueryRef.current && !isPopState.current) {
      window.history.pushState(null, "", SEARCH_HASH_PREFIX + encodeURIComponent(searchQueryRef.current));
    }
    // Clear search mode on navigation
    setSearchQuery("");
    setSearchResults(null);
    searchQueryRef.current = "";
    searchActiveRef.current = false;

    if (!path) {
      // Navigate to root = show "Select a share" screen
      setCurrentPath("");
      setEntries([]);
      setSelected(new Set());
      setError(null);
      if (!isPopState.current) {
        window.history.pushState(null, "", "#/");
      }
      isPopState.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const data = await fetchFiles(path);
      setEntries(data);
      setCurrentPath(path);
      if (!isPopState.current) {
        window.history.pushState(null, "", "#" + encodeURIComponent(path));
      }
      isPopState.current = false;
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
      navigate("");
      return;
    }
    parts.pop();
    navigate("/" + parts.join("/"));
  }, [currentPath, navigate]);

  const refresh = useCallback(async () => {
    if (!currentPath) return;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const data = await fetchFiles(currentPath);
      setEntries(data);
    } catch {
      // Current folder may have been deleted; walk up to nearest existing parent
      const parts = currentPath.split("/").filter(Boolean);
      while (parts.length > 1) {
        parts.pop();
        try {
          const data = await fetchFiles("/" + parts.join("/"));
          setEntries(data);
          setCurrentPath("/" + parts.join("/"));
          showToast("Folder not found, moved to parent", "error");
          setLoading(false);
          return;
        } catch {
          continue;
        }
      }
      setCurrentPath("");
      setEntries([]);
      showToast("Folder not found", "error");
    } finally {
      setLoading(false);
    }
  }, [currentPath, showToast]);

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

  const setSelectedSet = useCallback((names: Set<string>) => {
    setSelected(names);
  }, []);

  const clearClipboard = useCallback(() => {
    setClipboard(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (selected.size === 0) return;
    const isSearchMode = searchResults !== null;
    setClipboard({
      entries: Array.from(selected).map((key) => ({
        name: key.split("/").pop()!,
        path: isSearchMode ? key : currentPath + "/" + key,
      })),
      mode: "copy",
    });
    showToast(`${selected.size} item(s) copied`);
  }, [selected, currentPath, searchResults, showToast]);

  const handleCut = useCallback(() => {
    if (selected.size === 0) return;
    const isSearchMode = searchResults !== null;
    setClipboard({
      entries: Array.from(selected).map((key) => ({
        name: key.split("/").pop()!,
        path: isSearchMode ? key : currentPath + "/" + key,
      })),
      mode: "cut",
    });
    showToast(`${selected.size} item(s) cut`);
  }, [selected, currentPath, searchResults, showToast]);

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
    const isSearchMode = searchResults !== null;
    for (const key of selected) {
      try {
        const path = isSearchMode ? key : currentPath + "/" + key;
        await deleteFile(path);
      } catch (e) {
        showToast((e as Error).message, "error");
        return;
      }
    }
    showToast(`${selected.size} item(s) deleted`);
    setSelected(new Set());
    if (isSearchMode && searchQuery) {
      // Re-run search to refresh results
      handleSearch(searchQuery);
    } else {
      refresh();
    }
  }, [selected, currentPath, searchResults, searchQuery, refresh, showToast, handleSearch]);

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
    async (items: UploadItem[]) => {
      // Collect unique directory paths that need to be created
      const dirs = new Set<string>();
      for (const item of items) {
        const dir = item.relativePath.substring(0, item.relativePath.lastIndexOf("/"));
        if (dir) {
          dirs.add(dir);
        }
      }

      // Create directories (sorted by depth so parents are created first)
      if (dirs.size > 0) {
        const sortedDirs = Array.from(dirs).sort((a, b) => a.split("/").length - b.split("/").length);
        for (const dir of sortedDirs) {
          try {
            await createDir(currentPath + "/" + dir, true);
          } catch {
            // Directory may already exist, ignore
          }
        }
      }

      for (const item of items) {
        const key = `${item.relativePath}-${Date.now()}-${Math.random()}`;

        // Throttle progress updates with rAF to avoid excessive re-renders
        let rafId = 0;
        let lastLoaded = 0;
        let lastTotal = 0;
        const flushProgress = () => {
          rafId = 0;
          setUploads((prev) => {
            const next = new Map(prev);
            const entry = next.get(key);
            if (entry) next.set(key, { ...entry, loaded: lastLoaded, size: lastTotal });
            return next;
          });
        };

        const { promise, abort } = uploadFileWithProgress(
          currentPath + "/" + item.relativePath,
          item.file,
          (loaded, total) => {
            lastLoaded = loaded;
            lastTotal = total;
            if (!rafId) rafId = requestAnimationFrame(flushProgress);
          }
        );

        setUploads((prev) => {
          const next = new Map(prev);
          next.set(key, { name: item.relativePath, size: item.file.size, loaded: 0, status: "uploading", abort });
          return next;
        });

        promise
          .then(() => {
            if (rafId) cancelAnimationFrame(rafId);
            setUploads((prev) => {
              const next = new Map(prev);
              const entry = next.get(key);
              if (entry) next.set(key, { ...entry, status: "done", loaded: entry.size });
              return next;
            });
            refresh();
            setTimeout(() => {
              setUploads((prev) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
              });
            }, 1000);
          })
          .catch((e) => {
            if (rafId) cancelAnimationFrame(rafId);
            setUploads((prev) => {
              const next = new Map(prev);
              const entry = next.get(key);
              if (entry) next.set(key, { ...entry, status: "error", error: (e as Error).message });
              return next;
            });
            setTimeout(() => {
              setUploads((prev) => {
                const next = new Map(prev);
                next.delete(key);
                return next;
              });
            }, 3000);
          });
      }
    },
    [currentPath, refresh]
  );

  const handleMoveTo = useCallback(
    async (srcPaths: string[], destDir: string) => {
      try {
        for (const src of srcPaths) {
          const name = src.split("/").pop()!;
          await renameFile(src, destDir + "/" + name);
        }
        showToast(`${srcPaths.length} item(s) moved`);
        refresh();
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    },
    [refresh, showToast]
  );

  const handleCopyTo = useCallback(
    async (srcPaths: string[], destDir: string) => {
      try {
        for (const src of srcPaths) {
          const name = src.split("/").pop()!;
          await copyFile(src, destDir + "/" + name);
        }
        showToast(`${srcPaths.length} item(s) copied`);
        refresh();
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    },
    [refresh, showToast]
  );

  useEffect(() => {
    loadShares().then(() => {
      const searchQ = getSearchFromHash();
      if (searchQ) {
        handleSearch(searchQ);
        return;
      }
      const initialPath = getPathFromHash();
      if (initialPath) {
        navigate(initialPath);
      }
    });
  }, [loadShares, navigate, handleSearch]);

  useEffect(() => {
    const handlePopState = () => {
      const searchQ = getSearchFromHash();
      if (searchQ) {
        isPopState.current = true;
        handleSearch(searchQ);
        return;
      }
      const path = getPathFromHash();
      isPopState.current = true;
      navigate(path);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigate, handleSearch]);

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
    setSelectedSet,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleMkdir,
    handleRename,
    handleUpload,
    handleMoveTo,
    handleCopyTo,
    clearClipboard,
    uploads,
    searchQuery,
    searchResults,
    searchLoading,
    handleSearch,
    clearSearch,
  };
}
