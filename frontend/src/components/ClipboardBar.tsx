import type { ClipboardState } from "../hooks/useFileExplorer";

interface ClipboardBarProps {
  clipboard: ClipboardState;
  onPaste: () => void;
  onCancel: () => void;
  isMobile?: boolean;
}

export default function ClipboardBar({ clipboard, onPaste, onCancel, isMobile }: ClipboardBarProps) {
  const isCut = clipboard.mode === "cut";

  return (
    <div
      className={`flex items-center justify-between px-2.5 md:px-3.5 text-xs flex-shrink-0 border-b ${
        isMobile ? "min-h-[36px] py-1.5" : "h-9"
      } ${
        isCut
          ? "bg-warning/8 border-warning/20"
          : "bg-accent/8 border-accent/20"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`flex-shrink-0 ${isCut ? "text-warning" : "text-accent"}`}>
          {isCut ? "✂ Cut" : "📋 Copied"}:
        </span>
        <span className={`font-mono text-text-muted overflow-hidden text-ellipsis whitespace-nowrap ${isMobile ? "max-w-[140px]" : "max-w-[300px]"}`}>
          {clipboard.entries.map((e) => e.name).join(", ")}
        </span>
        <span className="text-text-faint flex-shrink-0">
          ({clipboard.entries.length})
        </span>
      </div>
      <div className="flex gap-1.5 flex-shrink-0 ml-2">
        <button
          onClick={onPaste}
          className={`bg-accent/15 border border-accent/30 rounded text-accent text-xs cursor-pointer hover:bg-accent/25 ${isMobile ? "px-2.5 py-1 min-h-[32px]" : "px-3 py-0.5"}`}
        >
          Paste
        </button>
        <button
          onClick={onCancel}
          className={`border border-border-subtle rounded text-text-dim text-xs cursor-pointer hover:bg-surface-raised ${isMobile ? "px-2 py-1 min-h-[32px]" : "px-2 py-0.5"}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
