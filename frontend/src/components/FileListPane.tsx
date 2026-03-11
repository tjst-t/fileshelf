import { useState, useCallback, useRef, useEffect } from "react";
import type { FileEntry } from "../api/client";
import type { ClipboardState } from "../hooks/useFileExplorer";
import { downloadUrl } from "../api/client";
import { formatSize } from "../utils/format";
import { isPreviewable } from "../utils/fileTypes";
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
  onSelectRange: (name: string) => void;
  onSetSelected: (names: Set<string>) => void;
  onPreview: (entry: FileEntry) => void;
  onRichPreview: (entry: FileEntry) => void;
  onRename: (oldName: string, newName: string) => void;
  onDrop: (files: FileList) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onShowDropMenu: (paths: string[], destDir: string, x: number, y: number, sameDir: boolean) => void;
  isMobile?: boolean;
}

type SortKey = "name" | "size" | "modified" | "perms";
type SortDir = "asc" | "desc";

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
}: FileListPaneProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editName, setEditName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [dropTargetName, setDropTargetName] = useState<string | null>(null);

  // Lasso (rubber-band) selection state
  const [lasso, setLasso] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const lassoActiveRef = useRef(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

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

  const triggerDownload = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " \u25B4" : " \u25BE";
  };

  if (!currentPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-dark gap-2">
        <span className="text-4xl">📚</span>
        <span className="text-sm">Select a share from the tree</span>
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
          if (e.dataTransfer.files.length > 0) {
            onDrop(e.dataTransfer.files);
          }
        }}
      >
        {dragOver && (
          <div className="absolute inset-2 bg-accent/8 border-2 border-dashed border-accent rounded-lg z-10 flex items-center justify-center text-base text-accent font-medium pointer-events-none">
            Drop files to upload
          </div>
        )}

        <div ref={tableContainerRef} className="flex-1 overflow-auto">
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
        if (e.dataTransfer.files.length > 0) {
          onDrop(e.dataTransfer.files);
        }
      }}
    >
      {/* Upload drag overlay */}
      {dragOver && (
        <div className="absolute inset-2 bg-accent/8 border-2 border-dashed border-accent rounded-lg z-10 flex items-center justify-center text-base text-accent font-medium pointer-events-none">
          Drop files to upload
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
        ref={tableContainerRef}
        className="flex-1 overflow-auto"
        onContextMenu={handleBackgroundContextMenu}
        onMouseDown={handleLassoMouseDown}
      >
        <table className="w-full border-collapse table-fixed select-none">
          <thead className="sticky top-0 bg-surface-alt z-[2]">
            <tr>
              {([
                { key: "name" as SortKey, label: "Name", align: "text-left", width: "w-[45%]" },
                { key: "size" as SortKey, label: "Size", align: "text-right", width: "w-[15%]" },
                { key: "modified" as SortKey, label: "Modified", align: "text-left", width: "w-[22%]" },
                { key: "perms" as SortKey, label: "Perms", align: "text-left", width: "w-[18%]" },
              ]).map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-[11px] uppercase tracking-[0.05em] font-semibold select-none whitespace-nowrap border-b border-border cursor-pointer ${col.align} ${col.width} ${
                    sortKey === col.key ? "text-text bg-accent/6" : "text-text-dim"
                  } hover:text-text`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-text-muted text-sm">Loading...</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-text-dark text-sm">Empty directory</td>
              </tr>
            ) : (
              sorted.map((entry) => {
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
                        onSelectRange(entry.name);
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
              })
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
