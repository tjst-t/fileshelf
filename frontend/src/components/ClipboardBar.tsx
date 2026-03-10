import type { ClipboardState } from "../hooks/useFileExplorer";

interface ClipboardBarProps {
  clipboard: ClipboardState;
  onPaste: () => void;
  onCancel: () => void;
}

export default function ClipboardBar({ clipboard, onPaste, onCancel }: ClipboardBarProps) {
  const isCut = clipboard.mode === "cut";

  return (
    <div
      className={`h-9 flex items-center justify-between px-3.5 text-xs flex-shrink-0 border-b ${
        isCut
          ? "bg-warning/8 border-warning/20"
          : "bg-accent/8 border-accent/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={isCut ? "text-warning" : "text-accent"}>
          {isCut ? "✂ Cut" : "📋 Copied"}:
        </span>
        <span className="font-mono text-text-muted max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap">
          {clipboard.entries.map((e) => e.name).join(", ")}
        </span>
        <span className="text-text-faint">
          ({clipboard.entries.length} item{clipboard.entries.length > 1 ? "s" : ""})
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={onPaste}
          className="bg-accent/15 border border-accent/30 rounded px-3 py-0.5 text-accent text-xs cursor-pointer hover:bg-accent/25"
        >
          Paste here
        </button>
        <button
          onClick={onCancel}
          className="border border-border-subtle rounded px-2 py-0.5 text-text-dim text-xs cursor-pointer hover:bg-surface-raised"
        >
          ×
        </button>
      </div>
    </div>
  );
}
