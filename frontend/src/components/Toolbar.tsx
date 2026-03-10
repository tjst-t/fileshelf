import { useRef, useState } from "react";
import Breadcrumb from "./Breadcrumb";

interface ToolbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onNewFolder: (name: string) => void;
  onUpload: (files: FileList) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
}

export default function Toolbar({
  currentPath,
  onNavigate,
  onGoUp,
  onNewFolder,
  onUpload,
  showPreview,
  onTogglePreview,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  const handleNewFolder = () => {
    if (folderName.trim()) {
      onNewFolder(folderName.trim());
      setFolderName("");
      setShowNewFolder(false);
    }
  };

  const btnBase =
    "border border-border-subtle rounded px-2.5 py-0.5 text-xs cursor-pointer transition-colors";

  return (
    <div className="h-10 bg-surface-alt border-b border-border flex items-center px-3 gap-2 flex-shrink-0">
      <button
        className={`${btnBase} text-text-muted hover:text-text hover:bg-surface-raised disabled:opacity-30 disabled:cursor-default text-sm`}
        onClick={onGoUp}
        disabled={!currentPath}
        title="Go up"
      >
        ←
      </button>

      <div className="flex-1 min-w-0">
        <Breadcrumb currentPath={currentPath} onNavigate={onNavigate} />
      </div>

      {currentPath && (
        <>
          {showNewFolder ? (
            <div className="flex items-center gap-1">
              <input
                className="px-2 py-0.5 text-xs bg-bg border border-accent rounded text-text w-32 focus:outline-none"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewFolder();
                  if (e.key === "Escape") setShowNewFolder(false);
                }}
                placeholder="Folder name"
                autoFocus
              />
              <button
                className="px-2 py-0.5 text-xs rounded bg-accent text-bg hover:bg-accent-hover cursor-pointer"
                onClick={handleNewFolder}
              >
                OK
              </button>
              <button
                className={`${btnBase} text-text-muted hover:text-text`}
                onClick={() => setShowNewFolder(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className={`${btnBase} text-text-muted hover:text-text`}
              onClick={() => setShowNewFolder(true)}
              title="New Folder"
            >
              + New folder
            </button>
          )}

          <button
            className="border border-accent/30 bg-accent/15 rounded px-2.5 py-0.5 text-xs text-accent cursor-pointer hover:bg-accent/25 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            title="Upload"
          >
            ⬆ Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUpload(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </>
      )}

      <div className="w-px h-5 bg-border-subtle" />

      <button
        className={`${btnBase} ${
          showPreview
            ? "text-accent border-accent/30 bg-accent/12"
            : "text-text-dim"
        } hover:text-text`}
        onClick={onTogglePreview}
        title="Toggle Preview"
      >
        ☰ Preview
      </button>
    </div>
  );
}
