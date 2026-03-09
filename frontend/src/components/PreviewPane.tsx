import { useState, useEffect } from "react";
import type { FileEntry } from "../api/client";
import { downloadUrl, previewUrl } from "../api/client";

interface PreviewPaneProps {
  entry: FileEntry | null;
  currentPath: string;
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

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

export default function PreviewPane({ entry, currentPath }: PreviewPaneProps) {
  if (!entry) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm bg-surface border-l border-border">
        Select a file to preview
      </div>
    );
  }

  const filePath = currentPath + "/" + entry.name;
  const url = previewUrl(filePath);
  const dlUrl = downloadUrl(filePath);

  return (
    <div className="h-full flex flex-col bg-surface border-l border-border overflow-hidden">
      {/* Preview area */}
      <div className="flex-1 overflow-auto p-3 flex items-center justify-center">
        {isImage(entry.name) ? (
          <img src={url} alt={entry.name} className="max-w-full max-h-full object-contain" />
        ) : isVideo(entry.name) ? (
          <video src={url} controls className="max-w-full max-h-full" />
        ) : isAudio(entry.name) ? (
          <audio src={url} controls className="w-full" />
        ) : isPdf(entry.name) ? (
          <iframe src={url} className="w-full h-full border-0" title={entry.name} />
        ) : isText(entry.name) ? (
          <TextPreview url={url} />
        ) : (
          <div className="text-text-muted text-sm text-center">
            <p>No preview available</p>
            <a
              href={dlUrl}
              className="text-accent hover:text-accent-hover underline mt-2 inline-block"
            >
              Download file
            </a>
          </div>
        )}
      </div>

      {/* File info */}
      <div className="border-t border-border px-3 py-2 text-xs text-text-muted space-y-1">
        <div className="font-medium text-text truncate">{entry.name}</div>
        <div>Type: {entry.type}</div>
        <div>Size: {formatSize(entry.size)}</div>
        <div>Modified: {new Date(entry.modified).toLocaleString()}</div>
        <div>Permissions: <code className="font-mono">{entry.perms}</code></div>
        <a
          href={dlUrl}
          className="text-accent hover:text-accent-hover underline inline-block mt-1"
        >
          Download
        </a>
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

  if (error) return <div className="text-danger text-sm">Error: {error}</div>;
  if (content === null) return <div className="text-text-muted text-sm">Loading...</div>;

  return (
    <pre className="w-full h-full overflow-auto text-xs font-mono text-text whitespace-pre-wrap break-all p-2 bg-bg rounded">
      {content}
    </pre>
  );
}
