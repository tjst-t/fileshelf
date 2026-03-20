import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { FileEntry, Share, SearchResultEntry } from "../api/client";
import type { ClipboardState, UploadProgress, UploadItem } from "../hooks/useFileExplorer";
import { downloadUrl } from "../api/client";
import { formatSize } from "../utils/format";
import { isPreviewable } from "../utils/fileTypes";
import { captureDrop, processDropItems } from "../utils/dropItems";
import ContextMenu from "./ContextMenu";
import type { ContextMenuItem } from "./ContextMenu";

interface FileListPaneProps {
  entries: FileEntry[];
  selected: Set<string>;
  currentPath: string;
  loading: boolean;
  clipboard: ClipboardState | null;
  onNavigate: (path: string) => void;
  onSelect: (name: string, multi: boolean) => void;
  onSelectRange: (name: string, sortedNames?: string[]) => void;
  onSetSelected: (names: Set<string>) => void;
  onPreview: (entry: FileEntry, pathOverride?: string) => void;
  onRichPreview: (entry: FileEntry, pathOverride?: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDrop: (items: UploadItem[]) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onShowDropMenu: (paths: string[], destDir: string, x: number, y: number, sameDir: boolean) => void;
  isMobile?: boolean;
  uploads?: Map<string, UploadProgress>;
  shares?: Share[];
  searchResults?: SearchResultEntry[] | null;
  searchLoading?: boolean;
  fileListScrollRef?: React.RefObject<HTMLDivElement | null>;
  pendingScrollRestore?: React.RefObject<number | null>;
}

type SortKey = "name" | "ext" | "size" | "modified" | "perms";
type SortDir = "asc" | "desc";

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }) + " " + d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
  });
}

function fileIcon(entry: FileEntry): string {
  if (entry.type === "dir") return "\u{1F4C1}";
  const ext = entry.name.split(".").pop()?.toLowerCase();
  const icons: Record<string, string> = {
    mp4: "\u{1F3AC}", mkv: "\u{1F3AC}", avi: "\u{1F3AC}", mov: "\u{1F3AC}", webm: "\u{1F3AC}",
    mp3: "\u{1F3B5}", flac: "\u{1F3B5}", wav: "\u{1F3B5}", ogg: "\u{1F3B5}", aac: "\u{1F3B5}",
    jpg: "\u{1F5BC}", jpeg: "\u{1F5BC}", png: "\u{1F5BC}", gif: "\u{1F5BC}", webp: "\u{1F5BC}", svg: "\u{1F5BC}",
    pdf: "\u{1F4C4}",
    txt: "\u{1F4DD}", md: "\u{1F4DD}", log: "\u{1F4DD}",
    zip: "\u{1F4E6}", tar: "\u{1F4E6}", gz: "\u{1F4E6}", "7z": "\u{1F4E6}", rar: "\u{1F4E6}",
  };
  return icons[ext || ""] || "\u{1F4C4}";
}

function ColumnResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const dragging = useRef(false);
  const startX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    dragging.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      startX.current = ev.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [onResize]);

  return (
    <div
      className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize z-[3] hover:bg-accent/30 active:bg-accent/50"
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function FileListPane({
  entries,
  selected,
  currentPath,
  loading,
  clipboard,
  onNavigate,
  onSelect,
  onSelectRange,
  onSetSelected,
  onPreview,
  onRichPreview,
  onRename,
  onDrop,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onShowDropMenu,
  isMobile,
  uploads,
  shares,
  searchResults,
  searchLoading,
  fileListScrollRef,
  pendingScrollRestore,
}: FileListPaneProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editName, setEditName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dropTargetName, setDropTargetName] = useState<string | null>(null);

  // Column widths (percentages)
  const [colWidths, setColWidths] = useState([38, 8, 13, 22, 19]);

  // Lasso (rubber-band) selection state
  const [lasso, setLasso] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const lassoActiveRef = useRef(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sync tableContainerRef with external fileListScrollRef
  const setTableContainerRef = useCallback((el: HTMLDivElement | null) => {
    (tableContainerRef as React.RefObject<HTMLDivElement | null>).current = el;
    if (fileListScrollRef) {
      (fileListScrollRef as React.RefObject<HTMLDivElement | null>).current = el;
    }
  }, [fileListScrollRef]);

  // Restore scroll position after entries load
  useEffect(() => {
    if (!pendingScrollRestore || pendingScrollRestore.current === null) return;
    if (loading || !tableContainerRef.current) return;
    const scrollTop = pendingScrollRestore.current;
    (pendingScrollRestore as React.RefObject<number | null>).current = null;
    requestAnimationFrame(() => {
      if (tableContainerRef.current) {
        tableContainerRef.current.scrollTop = scrollTop;
      }
    });
  }, [loading, pendingScrollRestore]);

  // Column resize handler
  const handleColResize = useCallback((colIndex: number, deltaX: number) => {
    if (!tableContainerRef.current) return;
    const tableWidth = tableContainerRef.current.clientWidth;
    if (tableWidth === 0) return;
    const deltaPct = (deltaX / tableWidth) * 100;
    setColWidths((prev) => {
      const next = [...prev];
      const minWidth = 3;
      const newLeft = next[colIndex] + deltaPct;
      const newRight = next[colIndex + 1] - deltaPct;
      if (newLeft < minWidth || newRight < minWidth) return prev;
      next[colIndex] = newLeft;
      next[colIndex + 1] = newRight;
      return next;
    });
  }, []);

  // Long-press for context menu on mobile
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "ext": {
        const extA = getExt(a.name);
        const extB = getExt(b.name);
        cmp = extA.localeCompare(extB) || a.name.localeCompare(b.name);
        break;
      }
      case "size":
        cmp = a.size - b.size;
        break;
      case "modified":
        cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime();
        break;
      case "perms":
        cmp = a.perms.localeCompare(b.perms);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.type === "dir") {
      onNavigate(currentPath + "/" + entry.name);
    } else if (isPreviewable(entry.name)) {
      onRichPreview(entry);
    } else {
      onPreview(entry);
    }
  };

  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (name: string) => {
    setEditName(name);
    setEditValue(name);
  };

  // Auto-select filename without extension when rename input mounts
  useEffect(() => {
    if (editName && renameInputRef.current) {
      const input = renameInputRef.current;
      input.focus();
      const dotIdx = editName.lastIndexOf(".");
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx);
      } else {
        input.select();
      }
    }
  }, [editName]);

  const commitRename = () => {
    if (editName && editValue && editName !== editValue) {
      onRename(editName, editValue);
    }
    setEditName(null);
  };

  // --- Left-click DnD (file move/copy via HTML5 DnD) ---

  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const draggedNames = selected.has(entry.name)
      ? Array.from(selected)
      : [entry.name];
    const paths = draggedNames.map((n) => currentPath + "/" + n);
    e.dataTransfer.setData("application/x-fileshelf", JSON.stringify({ paths, sourceDir: currentPath }));
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const handleRowDragOver = (e: React.DragEvent, entry: FileEntry) => {
    if (entry.type !== "dir") return;
    if (!e.dataTransfer.types.includes("application/x-fileshelf")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetName(entry.name);
  };

  const handleRowDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setDropTargetName(null);
  };

  const handleRowDrop = (e: React.DragEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetName(null);
    if (entry.type !== "dir") return;

    const raw = e.dataTransfer.getData("application/x-fileshelf");
    if (!raw) return;

    const { paths, sourceDir } = JSON.parse(raw) as { paths: string[]; sourceDir: string };
    const destDir = currentPath + "/" + entry.name;

    // Don't drop a folder into itself
    if (paths.some((p) => destDir.startsWith(p + "/") || destDir === p)) return;

    onShowDropMenu(paths, destDir, e.clientX, e.clientY, sourceDir === destDir);
  };

  // --- Lasso (rubber-band) selection (desktop only) ---

  const handleLassoMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("tr[data-row-name]")) return;
    if (target.closest("thead")) return;

    setLasso({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY });
    lassoActiveRef.current = true;
    e.preventDefault();
  };

  // Document-level mousemove/mouseup for lasso
  useEffect(() => {
    if (!lasso) return;

    const handleMove = (e: MouseEvent) => {
      setLasso((prev) => prev ? { ...prev, endX: e.clientX, endY: e.clientY } : null);
    };

    const handleUp = () => {
      setLasso(null);
      setTimeout(() => { lassoActiveRef.current = false; }, 0);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [lasso !== null]);

  // Update selection based on lasso rectangle
  useEffect(() => {
    if (!lasso || !tableContainerRef.current) return;

    const lassoRect = {
      left: Math.min(lasso.startX, lasso.endX),
      right: Math.max(lasso.startX, lasso.endX),
      top: Math.min(lasso.startY, lasso.endY),
      bottom: Math.max(lasso.startY, lasso.endY),
    };

    const rows = tableContainerRef.current.querySelectorAll("tr[data-row-name]");
    const names = new Set<string>();
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (rect.bottom >= lassoRect.top && rect.top <= lassoRect.bottom &&
          rect.right >= lassoRect.left && rect.left <= lassoRect.right) {
        names.add(row.getAttribute("data-row-name")!);
      }
    });
    onSetSelected(names);
  }, [lasso, onSetSelected]);

  // --- Context menus ---

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const items: ContextMenuItem[] = [];
    items.push({
      icon: "\u{1F4CB}",
      label: "Paste here",
      shortcut: "\u2318V",
      action: onPaste,
      disabled: !clipboard,
    });
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const buildContextMenuItems = (entry: FileEntry): ContextMenuItem[] => {
    const multi = selected.has(entry.name) ? selected.size > 1 : false;
    const items: ContextMenuItem[] = [];

    if (entry.type === "dir" && !multi) {
      items.push({
        icon: "\u{1F4C2}",
        label: "Open",
        action: () => onNavigate(currentPath + "/" + entry.name),
      });
    }

    // Preview (single file only)
    if (!multi && entry.type === "file" && isPreviewable(entry.name)) {
      items.push({
        icon: "\u{1F441}",
        label: "Preview",
        action: () => onRichPreview(entry),
      });
    }

    // Download
    if (multi) {
      const paths = Array.from(selected).map((n) => currentPath + "/" + n);
      items.push({
        icon: "\u2B07\uFE0F",
        label: `Download ${selected.size} items`,
        action: () => triggerDownload(`/api/files/download-zip?paths=${encodeURIComponent(paths.join(","))}`),
      });
    } else if (entry.type === "dir") {
      items.push({
        icon: "\u2B07\uFE0F",
        label: "Download as zip",
        action: () => triggerDownload(`/api/files/download-zip?paths=${encodeURIComponent(currentPath + "/" + entry.name)}`),
      });
    } else {
      items.push({
        icon: "\u2B07\uFE0F",
        label: "Download",
        action: () => triggerDownload(downloadUrl(currentPath + "/" + entry.name)),
      });
    }

    items.push({ icon: "", label: "", action: () => {}, divider: true });

    items.push({
      icon: "\u{1F4CB}",
      label: "Copy",
      shortcut: "\u2318C",
      action: onCopy,
    });
    items.push({
      icon: "\u2702\uFE0F",
      label: "Cut",
      shortcut: "\u2318X",
      action: onCut,
    });
    items.push({
      icon: "\u{1F4CB}",
      label: "Paste here",
      shortcut: "\u2318V",
      action: onPaste,
      disabled: !clipboard,
    });

    items.push({ icon: "", label: "", action: () => {}, divider: true });

    if (!multi) {
      items.push({
        icon: "\u270F\uFE0F",
        label: "Rename",
        action: () => startRename(entry.name),
      });
    }

    items.push({
      icon: "\u{1F5D1}",
      label: multi ? `Delete ${selected.size} items` : "Delete",
      danger: true,
      action: onDelete,
    });

    return items;
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    if (!selected.has(entry.name)) {
      onSelect(entry.name, false);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items: buildContextMenuItems(entry) });
  };

  // Long-press handlers for mobile context menu
  const handleTouchStart = (entry: FileEntry) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      if (!selected.has(entry.name)) {
        onSelect(entry.name, false);
      }
      // Show context menu centered on screen for mobile
      const x = window.innerWidth / 2;
      const y = window.innerHeight / 2;
      setContextMenu({ x, y, items: buildContextMenuItems(entry) });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Filter uploads to exclude files already in entries list
  const activeUploads = useMemo(() => {
    if (!uploads || uploads.size === 0) return [];
    const entryNames = new Set(entries.map((e) => e.name));
    return Array.from(uploads.entries()).filter(([, u]) => !entryNames.has(u.name) || u.status === "uploading");
  }, [entries, uploads]);

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " \u25B4" : " \u25BE";
  };

  // Search results view
  if (searchResults !== undefined && searchResults !== null) {
    const thClass = "px-3 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold select-none whitespace-nowrap border-b border-border text-text-dim";

    const toFileEntry = (r: SearchResultEntry): FileEntry => ({
      name: r.name, type: r.type, size: r.size, modified: r.modified, perms: r.perms,
    });

    const handleSearchDoubleClick = (result: SearchResultEntry) => {
      if (result.type === "dir") {
        onNavigate(result.dir + "/" + result.name);
      } else if (isPreviewable(result.name)) {
        onRichPreview(toFileEntry(result), result.dir);
      } else {
        onPreview(toFileEntry(result), result.dir);
      }
    };

    const handleSearchDragStart = (e: React.DragEvent, result: SearchResultEntry) => {
      const fullPath = result.dir + "/" + result.name;
      // If dragged item is selected, drag all selected; otherwise just this one
      let paths: string[];
      if (selected.has(fullPath)) {
        paths = Array.from(selected);
      } else {
        paths = [fullPath];
      }
      e.dataTransfer.setData("application/x-fileshelf", JSON.stringify({ paths, sourceDir: "__search__" }));
      e.dataTransfer.effectAllowed = "copyMove";
    };

    const handleSearchContextMenu = (e: React.MouseEvent, result: SearchResultEntry) => {
      e.preventDefault();
      const fullPath = result.dir + "/" + result.name;
      if (!selected.has(fullPath)) {
        onSelect(fullPath, false);
      }
      const multi = selected.has(fullPath) ? selected.size > 1 : false;
      const items: ContextMenuItem[] = [];

      // Open folder
      if (result.type === "dir" && !multi) {
        items.push({
          icon: "\u{1F4C2}",
          label: "Open",
          action: () => onNavigate(result.dir + "/" + result.name),
        });
      }

      // Preview
      if (!multi && result.type === "file" && isPreviewable(result.name)) {
        items.push({
          icon: "\u{1F441}",
          label: "Preview",
          action: () => onRichPreview(toFileEntry(result), result.dir),
        });
      }

      // Jump to location
      items.push({
        icon: "\u{1F4CD}",
        label: "Jump to location",
        action: () => onNavigate(result.dir),
      });

      // Download
      if (multi) {
        const paths = Array.from(selected);
        items.push({
          icon: "\u2B07\uFE0F",
          label: `Download ${selected.size} items`,
          action: () => triggerDownload(`/api/files/download-zip?paths=${encodeURIComponent(paths.join(","))}`),
        });
      } else if (result.type === "dir") {
        items.push({
          icon: "\u2B07\uFE0F",
          label: "Download as zip",
          action: () => triggerDownload(`/api/files/download-zip?paths=${encodeURIComponent(fullPath)}`),
        });
      } else {
        items.push({
          icon: "\u2B07\uFE0F",
          label: "Download",
          action: () => triggerDownload(downloadUrl(fullPath)),
        });
      }

      items.push({ icon: "", label: "", action: () => {}, divider: true });

      items.push({
        icon: "\u{1F4CB}",
        label: "Copy",
        shortcut: "\u2318C",
        action: onCopy,
      });
      items.push({
        icon: "\u2702\uFE0F",
        label: "Cut",
        shortcut: "\u2318X",
        action: onCut,
      });

      items.push({ icon: "", label: "", action: () => {}, divider: true });

      items.push({
        icon: "\u{1F5D1}",
        label: multi ? `Delete ${selected.size} items` : "Delete",
        danger: true,
        action: onDelete,
      });

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    };

    return (
      <div className="h-full flex flex-col overflow-hidden relative">
        {/* Loading overlay */}
        {searchLoading && (
          <div className="absolute inset-0 z-10 flex flex-col">
            {/* Animated progress bar */}
            <div className="h-0.5 w-full bg-border overflow-hidden flex-shrink-0">
              <div className="h-full bg-accent animate-[searchProgress_1.2s_ease-in-out_infinite] origin-left" />
            </div>
            <div className="flex-1 bg-surface/60 pointer-events-none" />
          </div>
        )}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse table-fixed select-none">
            <thead className="sticky top-0 bg-surface-alt z-[2]">
              <tr>
                <th className={`${thClass} text-left w-[35%]`}>Name</th>
                <th className={`${thClass} text-left w-[30%]`}>Location</th>
                <th className={`${thClass} text-right w-[12%]`}>Size</th>
                <th className={`${thClass} text-left w-[23%]`}>Modified</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.length === 0 && searchLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted text-sm">Searching...</td>
                </tr>
              ) : searchResults.length === 0 && !searchLoading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-text-dark text-sm">No results found</td>
                </tr>
              ) : (
                searchResults.map((result, i) => {
                  const fullPath = result.dir + "/" + result.name;
                  const isSelected = selected.has(fullPath);
                  return (
                    <tr
                      key={`${fullPath}-${i}`}
                      data-row-name={fullPath}
                      className={`cursor-pointer transition-colors duration-100 border-b border-border/50 ${
                        isSelected ? "bg-accent/12" : "hover:bg-hover-row"
                      }`}
                      draggable
                      onDragStart={(e) => handleSearchDragStart(e, result)}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          // Range select within search results
                          const keys = searchResults.map(r => r.dir + "/" + r.name);
                          if (selected.size === 0) {
                            onSetSelected(new Set([fullPath]));
                          } else {
                            const last = Array.from(selected).pop()!;
                            const from = keys.indexOf(last);
                            const to = keys.indexOf(fullPath);
                            if (from === -1 || to === -1) {
                              onSetSelected(new Set([fullPath]));
                            } else {
                              const [s, end] = from < to ? [from, to] : [to, from];
                              onSetSelected(new Set([...selected, ...keys.slice(s, end + 1)]));
                            }
                          }
                        } else {
                          onSelect(fullPath, e.ctrlKey || e.metaKey);
                        }
                      }}
                      onDoubleClick={() => handleSearchDoubleClick(result)}
                      onContextMenu={(e) => handleSearchContextMenu(e, result)}
                    >
                      <td className="px-3 py-1.5 text-[13px]">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="flex-shrink-0 text-[15px]">{fileIcon({ ...result, modified: result.modified } as FileEntry)}</span>
                          <span className={`truncate ${result.type === "dir" ? "text-accent" : "text-text"}`}>
                            {result.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-[12px]">
                        <button
                          className="text-accent hover:underline truncate block max-w-full text-left cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(result.dir);
                          }}
                          title={result.dir}
                        >
                          {result.dir}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-right text-text-dim font-mono text-xs">
                        {result.type === "dir" ? "\u2014" : formatSize(result.size)}
                      </td>
                      <td className="px-3 py-1.5 text-text-dim font-mono text-xs">
                        {formatDate(result.modified)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  if (!currentPath) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse table-fixed select-none">
            <thead className="sticky top-0 bg-surface-alt z-[2]">
              <tr>
                <th className="px-3 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold select-none whitespace-nowrap border-b border-border text-left w-[45%] text-text-dim">Name</th>
                <th className="px-3 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold select-none whitespace-nowrap border-b border-border text-right w-[15%] text-text-dim">Size</th>
                <th className="px-3 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold select-none whitespace-nowrap border-b border-border text-left w-[22%] text-text-dim">Modified</th>
                <th className="px-3 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold select-none whitespace-nowrap border-b border-border text-left w-[18%] text-text-dim">Perms</th>
              </tr>
            </thead>
            <tbody>
              {shares && shares.length > 0 ? shares.map((share) => (
                <tr
                  key={share.name}
                  className="cursor-pointer transition-colors duration-100 border-b border-border/50 hover:bg-hover-row"
                  onClick={() => onNavigate(share.name)}
                >
                  <td className="px-3 py-1.5 text-[13px]">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="flex-shrink-0 text-[15px]">{"\u{1F4C1}"}</span>
                      <span className="truncate text-accent">{share.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-text-dim font-mono text-xs">&mdash;</td>
                  <td className="px-3 py-1.5 text-text-dim font-mono text-xs"></td>
                  <td className="px-3 py-1.5 text-text-faint font-mono text-xs"></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-text-dark text-sm">No shares available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Mobile: card/list layout
  if (isMobile) {
    return (
      <div
        className="h-full flex flex-col overflow-hidden relative"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!e.dataTransfer.types.includes("application/x-fileshelf")) {
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => { e.stopPropagation(); setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const captured = captureDrop(e.dataTransfer);
          if (captured.entries.length > 0 || captured.files.length > 0) {
            processDropItems(captured).then(items => {
              if (items.length > 0) onDrop(items);
            });
          }
        }}
      >
        {dragOver && (
          <div className="absolute inset-2 bg-accent/8 border-2 border-dashed border-accent rounded-lg z-10 flex items-center justify-center text-base text-accent font-medium pointer-events-none">
            Drop files or folders to upload
          </div>
        )}

        <div ref={setTableContainerRef} className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-8 text-center text-text-muted text-sm">Loading...</div>
          ) : sorted.length === 0 ? (
            <div className="py-10 text-center text-text-dark text-sm">Empty directory</div>
          ) : (
            <div className="divide-y divide-border/50">
              {sorted.map((entry) => {
                const isSelected = selected.has(entry.name);
                const isCut = clipboard?.mode === "cut" && clipboard.entries.some((e) => e.name === entry.name);
                return (
                  <div
                    key={entry.name}
                    data-row-name={entry.name}
                    className={`flex items-center gap-3 px-3 py-2.5 min-h-[48px] transition-colors active:bg-accent/15 ${
                      isSelected ? "bg-accent/12" : ""
                    }`}
                    style={{ opacity: isCut ? 0.4 : 1 }}
                    onClick={(e) => {
                      if (longPressTriggered.current) return;
                      onSelect(entry.name, e.ctrlKey || e.metaKey);
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onTouchStart={() => handleTouchStart(entry)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                  >
                    <span className="flex-shrink-0 text-xl">{fileIcon(entry)}</span>
                    <div className="flex-1 min-w-0">
                      {editName === entry.name ? (
                        <input
                          ref={renameInputRef}
                          className="w-full bg-bg border border-accent rounded px-2 py-1 text-sm text-text focus:outline-none select-text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditName(null);
                          }}
                          onBlur={commitRename}
                        />
                      ) : (
                        <>
                          <div className={`text-sm truncate ${entry.type === "dir" ? "text-accent" : "text-text"}`}>
                            {entry.name}
                          </div>
                          <div className="text-[11px] text-text-faint font-mono mt-0.5">
                            {entry.type === "dir" ? "Folder" : formatSize(entry.size)}
                            {" · "}
                            {formatDateShort(entry.modified)}
                          </div>
                        </>
                      )}
                    </div>
                    {entry.type === "dir" && (
                      <button
                        className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-text-dim hover:bg-surface-raised"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate(currentPath + "/" + entry.name);
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 4 10 8 6 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
              {activeUploads.map(([key, u]) => {
                const pct = u.size > 0 ? Math.round((u.loaded / u.size) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3 px-3 py-2.5 min-h-[48px] opacity-60">
                    <span className="flex-shrink-0 text-xl">{"\u{1F4C4}"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate text-text">{u.name}</div>
                      {u.status === "error" ? (
                        <div className="text-[11px] text-danger mt-0.5">Error: {u.error}</div>
                      ) : (
                        <div className="mt-1">
                          <div className="h-1 rounded bg-surface-raised overflow-hidden">
                            <div
                              className="h-full rounded transition-all duration-200"
                              style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }}
                            />
                          </div>
                          <div className="text-[11px] text-text-faint font-mono mt-0.5">
                            {u.status === "done" ? "Done" : `${pct}%`}
                          </div>
                        </div>
                      )}
                    </div>
                    {u.status === "uploading" && u.abort && (
                      <button
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-text-dim hover:bg-surface-raised hover:text-danger cursor-pointer transition-colors"
                        onClick={() => u.abort!()}
                        title="Cancel upload"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Desktop: table layout
  return (
    <div
      className="h-full flex flex-col overflow-hidden relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-fileshelf")) {
          // Internal drag: allow drop on background (same directory)
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("application/x-fileshelf")) {
          // Internal drag dropped on background = same directory
          e.preventDefault();
          e.stopPropagation();
          const raw = e.dataTransfer.getData("application/x-fileshelf");
          if (!raw) return;
          const { paths, sourceDir } = JSON.parse(raw) as { paths: string[]; sourceDir: string };
          onShowDropMenu(paths, currentPath, e.clientX, e.clientY, sourceDir === currentPath);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const captured = captureDrop(e.dataTransfer);
        if (captured.entries.length > 0 || captured.files.length > 0) {
          processDropItems(captured).then(items => {
            if (items.length > 0) onDrop(items);
          });
        }
      }}
    >
      {/* Upload drag overlay */}
      {dragOver && (
        <div className="absolute inset-2 bg-accent/8 border-2 border-dashed border-accent rounded-lg z-10 flex items-center justify-center text-base text-accent font-medium pointer-events-none">
          Drop files or folders to upload
        </div>
      )}

      {/* Lasso selection rectangle */}
      {lasso && (
        <div
          className="fixed border border-accent/60 bg-accent/10 pointer-events-none z-20 rounded-sm"
          style={{
            left: Math.min(lasso.startX, lasso.endX),
            top: Math.min(lasso.startY, lasso.endY),
            width: Math.abs(lasso.endX - lasso.startX),
            height: Math.abs(lasso.endY - lasso.startY),
          }}
        />
      )}

      {/* Table */}
      <div
        ref={setTableContainerRef}
        className="flex-1 overflow-auto"
        onContextMenu={handleBackgroundContextMenu}
        onMouseDown={handleLassoMouseDown}
      >
        <table className="w-full border-collapse table-fixed select-none">
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-surface-alt z-[2]">
            <tr>
              {([
                { key: "name" as SortKey, label: "Name", align: "text-left" },
                { key: "ext" as SortKey, label: "Ext", align: "text-left" },
                { key: "size" as SortKey, label: "Size", align: "text-right" },
                { key: "modified" as SortKey, label: "Modified", align: "text-left" },
                { key: "perms" as SortKey, label: "Perms", align: "text-left" },
              ]).map((col, colIdx) => (
                <th
                  key={col.key}
                  className={`relative px-3 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold select-none whitespace-nowrap border-b border-border cursor-pointer ${col.align} ${
                    sortKey === col.key ? "text-text bg-accent/6" : "text-text-dim"
                  } hover:text-text`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{sortIndicator(col.key)}
                  {colIdx < colWidths.length - 1 && (
                    <ColumnResizeHandle onResize={(dx) => handleColResize(colIdx, dx)} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted text-sm">Loading...</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-text-dark text-sm">Empty directory</td>
              </tr>
            ) : (
              <>
                {sorted.map((entry) => {
                const isSelected = selected.has(entry.name);
                const isCut = clipboard?.mode === "cut" && clipboard.entries.some((e) => e.name === entry.name);
                const isDropHighlight = dropTargetName === entry.name;
                return (
                  <tr
                    key={entry.name}
                    data-row-name={entry.name}
                    data-drop-target={entry.type === "dir" ? currentPath + "/" + entry.name : undefined}
                    className={`cursor-pointer transition-colors duration-100 border-b border-border/50 ${
                      isDropHighlight
                        ? "bg-accent/25 outline outline-2 outline-accent/50 -outline-offset-2"
                        : isSelected ? "bg-accent/12" : "hover:bg-hover-row"
                    }`}
                    style={{ opacity: isCut ? 0.4 : 1 }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, entry)}
                    onDragOver={(e) => handleRowDragOver(e, entry)}
                    onDragLeave={handleRowDragLeave}
                    onDrop={(e) => handleRowDrop(e, entry)}
                    onClick={(e) => {
                      if (lassoActiveRef.current) return;
                      if (e.shiftKey) {
                        onSelectRange(entry.name, sorted.map((e) => e.name));
                      } else {
                        onSelect(entry.name, e.ctrlKey || e.metaKey);
                      }
                    }}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                  >
                    <td className="px-3 py-1.5 text-[13px]">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="flex-shrink-0 text-[15px]">{fileIcon(entry)}</span>
                        {editName === entry.name ? (
                          <input
                            ref={renameInputRef}
                            className="flex-1 bg-bg border border-accent rounded px-1 py-0.5 text-sm text-text focus:outline-none select-text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditName(null);
                            }}
                            onBlur={commitRename}
                          />
                        ) : (
                          <span
                            className={`truncate ${entry.type === "dir" ? "text-accent" : "text-text"}`}
                          >
                            {entry.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-text-dim font-mono text-xs truncate">
                      {entry.type === "dir" ? "" : getExt(entry.name)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-text-dim font-mono text-xs">
                      {entry.type === "dir" ? "\u2014" : formatSize(entry.size)}
                    </td>
                    <td className="px-3 py-1.5 text-text-dim font-mono text-xs">
                      {formatDate(entry.modified)}
                    </td>
                    <td className="px-3 py-1.5 text-text-faint font-mono text-xs">
                      {entry.perms}
                    </td>
                  </tr>
                );
              })}
                {activeUploads.map(([key, u]) => {
                  const pct = u.size > 0 ? Math.round((u.loaded / u.size) * 100) : 0;
                  return (
                    <tr key={key} className="border-b border-border/50 opacity-60">
                      <td className="px-3 py-1.5 text-[13px]">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="flex-shrink-0 text-[15px]">{"\u{1F4C4}"}</span>
                          <span className="truncate text-text">{u.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-text-dim font-mono text-xs truncate">
                        {getExt(u.name)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs">
                        {u.status === "error" ? (
                          <span className="text-danger">{u.error}</span>
                        ) : (
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-16 h-1 rounded bg-surface-raised overflow-hidden">
                              <div
                                className="h-full rounded transition-all duration-200"
                                style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }}
                              />
                            </div>
                            <span className="text-text-dim font-mono">{pct}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-text-dim font-mono text-xs">
                        {u.status === "uploading" ? "Uploading..." : u.status === "done" ? "Done" : "Error"}
                      </td>
                      <td className="px-3 py-1.5">
                        {u.status === "uploading" && u.abort && (
                          <button
                            className="w-6 h-6 flex items-center justify-center rounded text-text-dim hover:text-danger cursor-pointer transition-colors"
                            onClick={() => u.abort!()}
                            title="Cancel upload"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
