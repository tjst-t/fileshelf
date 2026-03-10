import { useState, useCallback } from "react";
import type { FileEntry } from "../api/client";
import type { ClipboardState } from "../hooks/useFileExplorer";
import { formatSize } from "../utils/format";
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
  onPreview: (entry: FileEntry) => void;
  onRename: (oldName: string, newName: string) => void;
  onDrop: (files: FileList) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
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
  onPreview,
  onRename,
  onDrop,
  onCopy,
  onCut,
  onPaste,
  onDelete,
}: FileListPaneProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editName, setEditName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

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
    } else {
      onPreview(entry);
    }
  };

  const startRename = (name: string) => {
    setEditName(name);
    setEditValue(name);
  };

  const commitRename = () => {
    if (editName && editValue && editName !== editValue) {
      onRename(editName, editValue);
    }
    setEditName(null);
  };

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    if (!selected.has(entry.name)) {
      onSelect(entry.name, false);
    }
    const multi = selected.has(entry.name) ? selected.size > 1 : false;

    const items: ContextMenuItem[] = [];

    if (entry.type === "dir" && !multi) {
      items.push({
        icon: "\u{1F4C2}",
        label: "Open",
        action: () => onNavigate(currentPath + "/" + entry.name),
      });
      items.push({ icon: "", label: "", action: () => {}, divider: true });
    }

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

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? " \u25B4" : " \u25BE";
  };

  if (!currentPath) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Select a share from the sidebar
      </div>
    );
  }

  return (
    <div
      className={`h-full flex flex-col overflow-hidden ${dragOver ? "ring-2 ring-accent ring-inset" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) {
          onDrop(e.dataTransfer.files);
        }
      }}
    >
      {/* Header */}
      <div className="grid grid-cols-[1fr_90px_140px_90px] gap-2 px-3 py-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider border-b border-border bg-surface select-none">
        <button className="text-left hover:text-text" onClick={() => handleSort("name")}>
          Name{sortIndicator("name")}
        </button>
        <button className="text-right hover:text-text" onClick={() => handleSort("size")}>
          Size{sortIndicator("size")}
        </button>
        <button className="text-right hover:text-text" onClick={() => handleSort("modified")}>
          Modified{sortIndicator("modified")}
        </button>
        <button className="text-left hover:text-text" onClick={() => handleSort("perms")}>
          Perms{sortIndicator("perms")}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-muted text-sm">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-text-muted text-sm">Empty directory</div>
        ) : (
          sorted.map((entry) => {
            const isSelected = selected.has(entry.name);
            return (
              <div
                key={entry.name}
                className={`grid grid-cols-[1fr_90px_140px_90px] gap-2 px-3 py-1 text-sm cursor-pointer hover:bg-surface-alt/50 ${
                  isSelected ? "bg-surface-alt" : ""
                }`}
                onClick={(e) => {
                  if (e.shiftKey) {
                    onSelectRange(entry.name);
                  } else {
                    onSelect(entry.name, e.ctrlKey || e.metaKey);
                  }
                }}
                onDoubleClick={() => handleDoubleClick(entry)}
                onContextMenu={(e) => handleContextMenu(e, entry)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0">{fileIcon(entry)}</span>
                  {editName === entry.name ? (
                    <input
                      className="flex-1 bg-bg border border-accent rounded px-1 py-0.5 text-sm text-text focus:outline-none"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditName(null);
                      }}
                      onBlur={commitRename}
                      autoFocus
                    />
                  ) : (
                    <span className="truncate">{entry.name}</span>
                  )}
                </div>
                <div className="text-right text-text-muted font-mono text-xs self-center">
                  {entry.type === "dir" ? "-" : formatSize(entry.size)}
                </div>
                <div className="text-right text-text-muted text-xs self-center">
                  {formatDate(entry.modified)}
                </div>
                <div className="text-text-muted font-mono text-xs self-center">{entry.perms}</div>
              </div>
            );
          })
        )}
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
