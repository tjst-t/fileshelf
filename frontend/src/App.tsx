import { useState, useCallback, useEffect } from "react";
import type { FileEntry } from "./api/client";
import { fetchVersion } from "./api/client";
import { useFileExplorer } from "./hooks/useFileExplorer";
import { useTheme } from "./hooks/useTheme";
import TitleBar from "./components/TitleBar";
import TreePane from "./components/TreePane";
import Toolbar from "./components/Toolbar";
import FileListPane from "./components/FileListPane";
import PreviewPane from "./components/PreviewPane";
import StatusBar from "./components/StatusBar";
import ClipboardBar from "./components/ClipboardBar";
import Toast from "./components/Toast";
import DeleteDialog from "./components/DeleteDialog";
import ResizeHandle from "./components/ResizeHandle";
import ContextMenu from "./components/ContextMenu";

export default function App() {
  const { theme, toggleTheme } = useTheme();

  const {
    shares,
    currentPath,
    entries,
    selected,
    loading,
    error,
    clipboard,
    toast,
    navigate,
    goUp,
    refresh,
    toggleSelect,
    selectRange,
    selectAll,
    clearSelection,
    setSelectedSet,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleMkdir,
    handleRename,
    handleUpload,
    handleMoveTo,
    handleCopyTo,
    clearClipboard,
  } = useFileExplorer();

  const [version, setVersion] = useState("");

  useEffect(() => {
    fetchVersion().then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  const [showPreview, setShowPreview] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [treePaneWidth, setTreePaneWidth] = useState(240);
  const [previewPaneWidth, setPreviewPaneWidth] = useState(320);
  const [globalDragOver, setGlobalDragOver] = useState(false);

  // Drop menu state (shown after left-click DnD drop on a folder)
  const [dropMenu, setDropMenu] = useState<{
    x: number; y: number; paths: string[]; destDir: string; sameDir: boolean;
  } | null>(null);

  const handleShowDropMenu = useCallback(
    (paths: string[], destDir: string, x: number, y: number, sameDir: boolean) => {
      setDropMenu({ x, y, paths, destDir, sameDir });
    },
    []
  );

  // When right-clicking a folder in the tree, navigate to its parent and select the folder
  const handleSelectForTree = useCallback(
    (folderPath: string) => {
      const lastSlash = folderPath.lastIndexOf("/");
      const parentPath = folderPath.substring(0, lastSlash) || "";
      const folderName = folderPath.substring(lastSlash + 1);

      if (parentPath !== currentPath) {
        navigate(parentPath).then(() => {
          toggleSelect(folderName, false);
        });
      } else {
        toggleSelect(folderName, false);
      }
    },
    [currentPath, navigate, toggleSelect]
  );

  const handlePreview = useCallback((entry: FileEntry) => {
    setPreviewEntry(entry);
    setShowPreview(true);
  }, []);

  const handleTreeResize = useCallback((delta: number) => {
    setTreePaneWidth((w) => Math.max(140, Math.min(500, w + delta)));
  }, []);

  const handlePreviewResize = useCallback((delta: number) => {
    setPreviewPaneWidth((w) => Math.max(220, Math.min(600, w - delta)));
  }, []);

  // Global drag-and-drop for upload
  const handleGlobalDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!currentPath) return;
      if (e.dataTransfer.types.includes("application/x-fileshelf")) return;
      e.preventDefault();
      setGlobalDragOver(true);
    },
    [currentPath]
  );

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setGlobalDragOver(false);
    }
  }, []);

  const handleGlobalDrop = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("application/x-fileshelf")) return;
      e.preventDefault();
      setGlobalDragOver(false);
      if (!currentPath) return;
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    [currentPath, handleUpload]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === "c") {
        e.preventDefault();
        handleCopy();
      } else if (mod && e.key === "x") {
        e.preventDefault();
        handleCut();
      } else if (mod && e.key === "v") {
        e.preventDefault();
        handlePaste();
      } else if (mod && e.key === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected.size > 0 && !showDeleteDialog) {
          e.preventDefault();
          setShowDeleteDialog(true);
        }
      } else if (e.key === "Escape") {
        clearSelection();
        setShowDeleteDialog(false);
      } else if (e.key === "F5" || (mod && e.key === "r")) {
        e.preventDefault();
        refresh();
      } else if (e.key === " ") {
        e.preventDefault();
        setShowPreview((p) => !p);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCopy, handleCut, handlePaste, selectAll, clearSelection, selected, showDeleteDialog, refresh]);

  // Update preview when selection changes
  useEffect(() => {
    if (selected.size === 1) {
      const name = Array.from(selected)[0];
      const entry = entries.find((e) => e.name === name);
      if (entry) setPreviewEntry(entry);
    }
  }, [selected, entries]);

  // Compute selected entries for preview
  const selectedEntries = entries.filter((e) => selected.has(e.name));

  return (
    <div
      className="h-full flex flex-col relative"
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {/* Global drag overlay */}
      {globalDragOver && (
        <div className="absolute inset-0 z-50 bg-accent/10 flex items-center justify-center pointer-events-none">
          <div className="bg-surface border-2 border-dashed border-accent rounded-xl px-12 py-8 text-center shadow-xl">
            <div className="text-4xl mb-3">📂</div>
            <div className="text-lg font-medium text-accent">Drop files to upload</div>
            <div className="text-sm text-text-muted mt-1">
              to {currentPath}
            </div>
          </div>
        </div>
      )}

      {/* Title bar */}
      <TitleBar username="tjstkm" version={version} theme={theme} onToggleTheme={toggleTheme} />

      {/* Toolbar */}
      <Toolbar
        currentPath={currentPath}
        onNavigate={navigate}
        onGoUp={goUp}
        onRefresh={refresh}
        onNewFolder={handleMkdir}
        onUpload={handleUpload}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((p) => !p)}
      />

      {/* Clipboard bar */}
      {clipboard && (
        <ClipboardBar
          clipboard={clipboard}
          onPaste={handlePaste}
          onCancel={clearClipboard}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tree pane */}
        <div className="flex-shrink-0" style={{ width: treePaneWidth }}>
          <TreePane
            shares={shares}
            currentPath={currentPath}
            clipboard={clipboard}
            onNavigate={navigate}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onDelete={() => setShowDeleteDialog(true)}
            onRename={handleRename}
            onSelectForTree={handleSelectForTree}
            onShowDropMenu={handleShowDropMenu}
          />
        </div>

        <ResizeHandle onResize={handleTreeResize} />

        {/* File list */}
        <div className="flex-1 min-w-0 flex flex-col">
          {error ? (
            <div className="flex items-center justify-center h-full text-danger text-sm">{error}</div>
          ) : (
            <FileListPane
              entries={entries}
              selected={selected}
              currentPath={currentPath}
              loading={loading}
              clipboard={clipboard}
              onNavigate={navigate}
              onSelect={toggleSelect}
              onSelectRange={selectRange}
              onSetSelected={setSelectedSet}
              onPreview={handlePreview}
              onRename={handleRename}
              onDrop={handleUpload}
              onCopy={handleCopy}
              onCut={handleCut}
              onPaste={handlePaste}
              onDelete={() => setShowDeleteDialog(true)}
              onShowDropMenu={handleShowDropMenu}
            />
          )}
        </div>

        {/* Preview pane */}
        {showPreview && (
          <>
            <ResizeHandle onResize={handlePreviewResize} />
            <div className="flex-shrink-0" style={{ width: previewPaneWidth }}>
              <PreviewPane
                entry={previewEntry}
                selectedEntries={selectedEntries}
                currentPath={currentPath}
                onClose={() => setShowPreview(false)}
              />
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <StatusBar entries={entries} selected={selected} version={version} />

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Delete dialog */}
      {showDeleteDialog && (
        <DeleteDialog
          count={selected.size}
          onConfirm={() => {
            handleDelete();
            setShowDeleteDialog(false);
          }}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}

      {/* Right-drag drop menu */}
      {dropMenu && (
        <ContextMenu
          x={dropMenu.x}
          y={dropMenu.y}
          items={[
            {
              icon: "\u{1F4C1}",
              label: "Move here",
              action: () => handleMoveTo(dropMenu.paths, dropMenu.destDir),
              disabled: dropMenu.sameDir,
            },
            {
              icon: "\u{1F4CB}",
              label: "Copy here",
              action: () => handleCopyTo(dropMenu.paths, dropMenu.destDir),
            },
            { icon: "", label: "", action: () => {}, divider: true },
            {
              icon: "\u2715",
              label: "Cancel",
              action: () => {},
            },
          ]}
          onClose={() => setDropMenu(null)}
        />
      )}
    </div>
  );
}
