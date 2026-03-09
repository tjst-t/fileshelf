import { useRef, useState } from "react";
import Breadcrumb from "./Breadcrumb";

interface ToolbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onNewFolder: (name: string) => void;
  onUpload: (files: FileList) => void;
  onRefresh: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
}

export default function Toolbar({
  currentPath,
  onNavigate,
  onGoUp,
  onNewFolder,
  onUpload,
  onRefresh,
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

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
      <button
        className="px-2 py-1 text-sm rounded hover:bg-surface-alt text-text-muted hover:text-text disabled:opacity-30"
        onClick={onGoUp}
        disabled={!currentPath}
        title="Go up"
      >
        &#8593;
      </button>

      <button
        className="px-2 py-1 text-sm rounded hover:bg-surface-alt text-text-muted hover:text-text"
        onClick={onRefresh}
        title="Refresh"
      >
        &#8635;
      </button>

      <div className="flex-1 min-w-0">
        <Breadcrumb currentPath={currentPath} onNavigate={onNavigate} />
      </div>

      {currentPath && (
        <>
          {showNewFolder ? (
            <div className="flex items-center gap-1">
              <input
                className="px-2 py-1 text-sm bg-bg border border-border rounded text-text w-32 focus:outline-none focus:border-accent"
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
                className="px-2 py-1 text-sm rounded bg-accent text-bg hover:bg-accent-hover"
                onClick={handleNewFolder}
              >
                OK
              </button>
              <button
                className="px-2 py-1 text-sm rounded hover:bg-surface-alt text-text-muted"
                onClick={() => setShowNewFolder(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="px-2 py-1 text-sm rounded hover:bg-surface-alt text-text-muted hover:text-text"
              onClick={() => setShowNewFolder(true)}
              title="New Folder"
            >
              + New
            </button>
          )}

          <button
            className="px-2 py-1 text-sm rounded hover:bg-surface-alt text-text-muted hover:text-text"
            onClick={() => fileInputRef.current?.click()}
            title="Upload"
          >
            &#8613; Upload
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

      <button
        className={`px-2 py-1 text-sm rounded hover:bg-surface-alt ${
          showPreview ? "text-accent" : "text-text-muted"
        } hover:text-text`}
        onClick={onTogglePreview}
        title="Toggle Preview"
      >
        &#9776;
      </button>
    </div>
  );
}
