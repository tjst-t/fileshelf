import type { FileEntry } from "../api/client";
import { formatSize } from "../utils/format";

interface StatusBarProps {
  entries: FileEntry[];
  selected: Set<string>;
}

export default function StatusBar({ entries, selected }: StatusBarProps) {
  const dirs = entries.filter((e) => e.type === "dir").length;
  const files = entries.length - dirs;
  const totalSize = entries.reduce((sum, e) => sum + (e.type === "file" ? e.size : 0), 0);

  const selectedEntries = entries.filter((e) => selected.has(e.name));
  const selectedSize = selectedEntries.reduce((sum, e) => sum + (e.type === "file" ? e.size : 0), 0);

  return (
    <div className="h-7 flex items-center justify-between px-3 text-[11px] text-text-faint font-mono bg-surface border-t border-border flex-shrink-0">
      <span>
        {selected.size > 0
          ? `${selected.size} selected`
          : `${entries.length} items (${dirs} dirs, ${files} files)`}
      </span>
      <span>
        {formatSize(selected.size > 0 ? selectedSize : totalSize)}
      </span>
    </div>
  );
}
