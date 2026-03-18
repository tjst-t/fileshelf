import { useRef, useState, useCallback, useEffect } from "react";
import type { UploadItem } from "../hooks/useFileExplorer";
import Breadcrumb from "./Breadcrumb";

interface ToolbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onRefresh: () => void;
  onNewFolder: (name: string) => void;
  onUpload: (items: UploadItem[]) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  isMobile?: boolean;
  searchQuery?: string;
  searchLoading?: boolean;
  onSearch?: (query: string, pushHistory?: boolean) => void;
  onClearSearch?: () => void;
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
}

export default function Toolbar({
  currentPath,
  onNavigate,
  onGoUp,
  onRefresh,
  onNewFolder,
  onUpload,
  showPreview,
  onTogglePreview,
  isMobile,
  searchQuery,
  searchLoading,
  onSearch,
  onClearSearch,
  searchOpen,
  onSearchOpenChange,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // Sync external searchOpen prop
  useEffect(() => {
    if (searchOpen && !showSearchInput) {
      setShowSearchInput(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [searchOpen, showSearchInput]);

  // Sync external searchQuery to local input
  useEffect(() => {
    if (searchQuery === undefined) return;
    if (searchQuery) {
      // Search restored (e.g., from history) — show input with the query
      setSearchInputValue(searchQuery);
      setShowSearchInput(true);
    } else {
      setSearchInputValue("");
      setShowSearchInput(false);
    }
  }, [searchQuery]);

  const handleSearchInputChange = useCallback((value: string) => {
    setSearchInputValue(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value) {
      onClearSearch?.();
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      onSearch?.(value);
    }, 300);
  }, [onSearch, onClearSearch]);

  const handleSearchClose = useCallback(() => {
    setShowSearchInput(false);
    setSearchInputValue("");
    onClearSearch?.();
    onSearchOpenChange?.(false);
  }, [onClearSearch, onSearchOpenChange]);

  const handleNewFolder = () => {
    if (folderName.trim()) {
      onNewFolder(folderName.trim());
      setFolderName("");
      setShowNewFolder(false);
    }
  };

  const btnBase =
    "border border-border-subtle rounded px-2.5 py-1 md:py-0.5 text-xs cursor-pointer transition-colors min-h-[36px] md:min-h-0";

  return (
    <div className="min-h-[40px] bg-surface-alt border-b border-border flex items-center px-2 md:px-3 gap-1.5 md:gap-2 flex-shrink-0 flex-wrap py-1 md:py-0">
      <button
        className={`${btnBase} text-text-muted hover:text-text hover:bg-surface-raised disabled:opacity-30 disabled:cursor-default text-sm`}
        onClick={onGoUp}
        disabled={!currentPath}
        title="Go up"
      >
        ↑
      </button>

      <button
        className={`${btnBase} text-text-muted hover:text-text hover:bg-surface-raised disabled:opacity-30 disabled:cursor-default text-sm`}
        onClick={onRefresh}
        disabled={!currentPath}
        title="Refresh"
      >
        ↻
      </button>

      <div className="flex-1 min-w-0">
        {showSearchInput ? (
          <div className="flex items-center gap-1 px-1">
            <span className="text-text-muted text-xs">🔍</span>
            <input
              ref={searchInputRef}
              className="flex-1 min-w-0 px-2 py-1 md:py-0.5 text-[13px] font-mono bg-bg border border-accent rounded text-text focus:outline-none"
              value={searchInputValue}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") handleSearchClose();
                if (e.key === "Enter" && searchInputValue.length >= 2) onSearch?.(searchInputValue, true);
              }}
              placeholder="Search file names..."
              autoFocus
            />
            {searchLoading && (
              <span className="text-text-muted text-xs animate-pulse">...</span>
            )}
            <button
              className="px-1.5 py-0.5 rounded text-text-muted hover:text-text hover:bg-surface-raised cursor-pointer text-xs"
              onClick={handleSearchClose}
            >
              ✕
            </button>
          </div>
        ) : (
          <Breadcrumb
            currentPath={currentPath}
            onNavigate={onNavigate}
            searchQuery={searchQuery}
            onClearSearch={onClearSearch}
          />
        )}
      </div>

      {currentPath && (
        <>
          {showNewFolder ? (
            <div className={`flex items-center gap-1 ${isMobile ? "w-full order-last" : ""}`}>
              <input
                className="px-2 py-1 md:py-0.5 text-xs bg-bg border border-accent rounded text-text flex-1 md:w-32 focus:outline-none"
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
                className="px-3 py-1 md:py-0.5 text-xs rounded bg-accent text-bg hover:bg-accent-hover cursor-pointer min-h-[36px] md:min-h-0"
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
              {isMobile ? "+" : "+ New folder"}
            </button>
          )}

          <button
            className="border border-accent/30 bg-accent/15 rounded px-2.5 py-1 md:py-0.5 text-xs text-accent cursor-pointer hover:bg-accent/25 transition-colors min-h-[36px] md:min-h-0"
            onClick={() => fileInputRef.current?.click()}
            title="Upload files"
          >
            {isMobile ? "⬆" : "⬆ Upload"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const items: UploadItem[] = Array.from(e.target.files).map(f => ({
                  file: f,
                  relativePath: f.name,
                }));
                onUpload(items);
                e.target.value = "";
              }
            }}
          />
          <button
            className="border border-accent/30 bg-accent/15 rounded px-2.5 py-1 md:py-0.5 text-xs text-accent cursor-pointer hover:bg-accent/25 transition-colors min-h-[36px] md:min-h-0"
            onClick={() => folderInputRef.current?.click()}
            title="Upload folder"
          >
            {isMobile ? "📁⬆" : "📁 Folder"}
          </button>
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            {...{ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const items: UploadItem[] = Array.from(e.target.files).map(f => ({
                  file: f,
                  relativePath: f.webkitRelativePath || f.name,
                }));
                onUpload(items);
                e.target.value = "";
              }
            }}
          />
        </>
      )}

      {!showSearchInput && (
        <button
          className={`${btnBase} text-text-muted hover:text-text hover:bg-surface-raised`}
          onClick={() => {
            setShowSearchInput(true);
            onSearchOpenChange?.(true);
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
          title="Search files"
        >
          {isMobile ? "🔍" : "🔍 Search"}
        </button>
      )}

      {!isMobile && <div className="w-px h-5 bg-border-subtle" />}

      <button
        className={`${btnBase} ${
          showPreview
            ? "text-accent border-accent/30 bg-accent/12"
            : "text-text-dim"
        } hover:text-text`}
        onClick={onTogglePreview}
        title="Toggle Preview"
      >
        {isMobile ? "👁" : "☰ Preview"}
      </button>
    </div>
  );
}
