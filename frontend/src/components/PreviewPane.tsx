import { useState, useEffect } from "react";
import type { FileEntry } from "../api/client";
import { downloadUrl, previewUrl } from "../api/client";
import { formatSize } from "../utils/format";

interface PreviewPaneProps {
  entry: FileEntry | null;
  selectedEntries: FileEntry[];
  currentPath: string;
  onClose: () => void;
}

function isText(name: string): boolean {
  const exts = ["txt", "md", "log", "json", "xml", "yaml", "yml", "toml", "ini", "conf", "sh", "bash", "py", "go", "js", "ts", "tsx", "jsx", "css", "html", "htm", "sql", "csv"];
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return exts.includes(ext);
}

function isImage(name: string): boolean {
  const exts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"];
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return exts.includes(ext);
}

function isVideo(name: string): boolean {
  const exts = ["mp4", "webm", "ogg"];
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return exts.includes(ext);
}

function isAudio(name: string): boolean {
  const exts = ["mp3", "wav", "ogg", "flac", "aac", "m4a"];
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return exts.includes(ext);
}

function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function fileIcon(name: string, type: string): string {
  if (type === "dir") return "\u{1F4C1}";
  const ext = name.split(".").pop()?.toLowerCase();
  const icons: Record<string, string> = {
    mp4: "\u{1F3AC}", mkv: "\u{1F3AC}", avi: "\u{1F3AC}",
    mp3: "\u{1F3B5}", flac: "\u{1F3B5}", wav: "\u{1F3B5}",
    jpg: "\u{1F5BC}", jpeg: "\u{1F5BC}", png: "\u{1F5BC}", gif: "\u{1F5BC}", webp: "\u{1F5BC}", svg: "\u{1F5BC}",
    pdf: "\u{1F4C4}",
    txt: "\u{1F4DD}", md: "\u{1F4DD}",
    zip: "\u{1F4E6}", tar: "\u{1F4E6}", gz: "\u{1F4E6}",
  };
  return icons[ext || ""] || "\u{1F4C4}";
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function PreviewPane({ entry, selectedEntries, currentPath, onClose }: PreviewPaneProps) {
  if (selectedEntries.length > 1) {
    return <MultiPreview entries={selectedEntries} currentPath={currentPath} onClose={onClose} />;
  }

  if (!entry) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-dark text-[13px] bg-surface border-l border-border">
        <span className="text-[32px] mb-2">👁</span>
        Select a file to preview
      </div>
    );
  }

  const filePath = currentPath + "/" + entry.name;
  const url = previewUrl(filePath);
  const dlUrl = downloadUrl(filePath);
  const ext = entry.name.split(".").pop()?.toUpperCase() || "";

  const infoRows = [
    ["Path", "/" + filePath.replace(/^\/+/, "")],
    ["Size", formatSize(entry.size)],
    ["Modified", entry.modified ? formatDateLong(entry.modified) : "\u2014"],
    ["Permissions", entry.perms],
    ["Type", ext],
  ];

  return (
    <div className="h-full flex flex-col bg-surface border-l border-border overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.05em]">Preview</span>
        <button
          onClick={onClose}
          className="text-text-dim hover:text-text cursor-pointer text-base leading-none px-1"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3.5">
        {/* File icon + name */}
        <div className="text-center pt-4 pb-5">
          <div className="text-5xl mb-2">{fileIcon(entry.name, entry.type)}</div>
          <div className="text-sm font-medium text-text break-all leading-snug">{entry.name}</div>
        </div>

        {/* Preview area */}
        <div className="mb-4">
          {isImage(entry.name) ? (
            <div className="bg-surface-raised rounded-md p-3 flex items-center justify-center min-h-[140px]">
              <img src={url} alt={entry.name} className="max-w-full max-h-full object-contain rounded" />
            </div>
          ) : isVideo(entry.name) ? (
            <div className="bg-surface-raised rounded-md p-3 flex items-center justify-center min-h-[140px]">
              <video src={url} controls className="max-w-full max-h-full" />
            </div>
          ) : isAudio(entry.name) ? (
            <div className="bg-surface-raised rounded-md p-4 flex flex-col items-center gap-2">
              <span className="text-3xl">🎵</span>
              <audio src={url} controls className="w-full" />
            </div>
          ) : isPdf(entry.name) ? (
            <div className="bg-surface-raised rounded-md p-4 text-center text-text-faint text-xs">
              <span className="text-3xl block mb-2">📄</span>
              PDF preview will open in browser viewer
            </div>
          ) : isText(entry.name) ? (
            <div className="bg-surface-raised rounded-md p-3 min-h-[80px]">
              <TextPreview url={url} />
            </div>
          ) : (
            <div className="bg-surface-raised rounded-md p-4 text-center text-text-faint text-xs">
              No preview available for this file type
            </div>
          )}
        </div>

        {/* File info */}
        <div className="text-xs text-text-dim">
          {infoRows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-text-faint">{label}</span>
              <span className="text-text-muted font-mono text-[11px] text-right max-w-[60%] break-all">{value}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-1.5">
          {entry.type === "dir" ? (
            <a
              href={`/api/files/download-zip?paths=${encodeURIComponent(filePath)}`}
              className="block w-full text-center bg-accent/15 border border-accent/30 rounded-[5px] text-accent text-xs py-2 hover:bg-accent/25 no-underline"
            >
              ⬇ Download as zip
            </a>
          ) : (
            <a
              href={dlUrl}
              className="block w-full text-center bg-accent/15 border border-accent/30 rounded-[5px] text-accent text-xs py-2 hover:bg-accent/25 no-underline"
            >
              ⬇ Download
            </a>
          )}
          <button
            className="w-full border border-border-subtle rounded-[5px] text-text-muted text-xs py-2 cursor-pointer hover:bg-surface-raised bg-transparent"
            onClick={() => navigator.clipboard?.writeText("/" + filePath.replace(/^\/+/, ""))}
          >
            📋 Copy path
          </button>
        </div>
      </div>
    </div>
  );
}

function MultiPreview({ entries, currentPath, onClose }: { entries: FileEntry[]; currentPath: string; onClose: () => void }) {
  const dirs = entries.filter(e => e.type === "dir");
  const files = entries.filter(e => e.type === "file");
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  const paths = entries.map(e => currentPath + "/" + e.name);

  return (
    <div className="h-full flex flex-col bg-surface border-l border-border overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-[0.05em]">Preview</span>
        <button
          onClick={onClose}
          className="text-text-dim hover:text-text cursor-pointer text-base leading-none px-1"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3.5">
        {/* Summary */}
        <div className="text-center pt-4 pb-5">
          <div className="text-5xl mb-2">📑</div>
          <div className="text-sm font-medium text-text">{entries.length} items selected</div>
          <div className="text-xs text-text-muted mt-1">
            {dirs.length > 0 && `${dirs.length} folder(s)`}
            {dirs.length > 0 && files.length > 0 && ", "}
            {files.length > 0 && `${files.length} file(s)`}
          </div>
        </div>

        {/* Item list */}
        <div className="mb-4">
          {entries.map(e => (
            <div key={e.name} className="flex items-center gap-2 py-1.5 border-b border-border/40 text-xs">
              <span className="text-sm flex-shrink-0">{fileIcon(e.name, e.type)}</span>
              <span className="truncate text-text-muted">{e.name}</span>
              <span className="ml-auto text-text-faint font-mono text-[11px] flex-shrink-0">
                {e.type === "dir" ? "\u2014" : formatSize(e.size)}
              </span>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="text-xs text-text-dim">
          <div className="flex justify-between py-1.5 border-b border-border/60">
            <span className="text-text-faint">Total size</span>
            <span className="text-text-muted font-mono text-[11px]">{formatSize(totalSize)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-1.5">
          <a
            href={`/api/files/download-zip?paths=${encodeURIComponent(paths.join(","))}`}
            className="block w-full text-center bg-accent/15 border border-accent/30 rounded-[5px] text-accent text-xs py-2 hover:bg-accent/25 no-underline"
          >
            ⬇ Download as zip
          </a>
        </div>
      </div>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.text();
      })
      .then(setContent)
      .catch((e) => setError(e.message));
  }, [url]);

  if (error) return <div className="text-danger text-xs">Error: {error}</div>;
  if (content === null) return <div className="text-text-muted text-xs">Loading...</div>;

  return (
    <pre className="font-mono text-[11px] leading-relaxed text-text-muted whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
      {content}
    </pre>
  );
}
