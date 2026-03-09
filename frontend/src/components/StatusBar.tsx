import type { FileEntry } from "../api/client";
import type { ClipboardState } from "../hooks/useFileExplorer";

interface StatusBarProps {
  entries: FileEntry[];
  selected: Set<string>;
  clipboard: ClipboardState | null;
  onPaste: () => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

export default function StatusBar({ entries, selected, clipboard, onPaste }: StatusBarProps) {
  const dirs = entries.filter((e) => e.type === "dir").length;
  const files = entries.length - dirs;
  const totalSize = entries.reduce((sum, e) => sum + (e.type === "file" ? e.size : 0), 0);

  const selectedEntries = entries.filter((e) => selected.has(e.name));
  const selectedSize = selectedEntries.reduce((sum, e) => sum + (e.type === "file" ? e.size : 0), 0);

  return (
    <div className="flex items-center justify-between px-3 py-1 text-xs text-text-muted bg-surface border-t border-border">
      <div className="flex items-center gap-4">
        <span>
          {entries.length} items ({dirs} dirs, {files} files)
        </span>
        {selected.size > 0 && (
          <span className="text-accent">
            {selected.size} selected ({formatSize(selectedSize)})
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {clipboard && (
          <div className="flex items-center gap-2">
            <span>
              {clipboard.mode === "copy" ? "Copied" : "Cut"}: {clipboard.entries.length} item(s)
            </span>
            <button
              className="px-2 py-0.5 rounded bg-accent text-bg text-xs hover:bg-accent-hover"
              onClick={onPaste}
            >
              Paste
            </button>
          </div>
        )}
        <span>{formatSize(totalSize)}</span>
      </div>
    </div>
  );
}
