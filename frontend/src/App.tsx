import { useState, useCallback, useEffect } from "react";
import type { FileEntry } from "./api/client";
import { useFileExplorer } from "./hooks/useFileExplorer";
import TreePane from "./components/TreePane";
import Toolbar from "./components/Toolbar";
import FileListPane from "./components/FileListPane";
import PreviewPane from "./components/PreviewPane";
import StatusBar from "./components/StatusBar";
import Toast from "./components/Toast";
import DeleteDialog from "./components/DeleteDialog";
import ResizeHandle from "./components/ResizeHandle";

export default function App() {
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
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleMkdir,
    handleRename,
    handleUpload,
  } = useFileExplorer();

  const [showPreview, setShowPreview] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [treePaneWidth, setTreePaneWidth] = useState(208);
  const [previewPaneWidth, setPreviewPaneWidth] = useState(288);

  const handlePreview = useCallback((entry: FileEntry) => {
    setPreviewEntry(entry);
    setShowPreview(true);
  }, []);

  const handleTreeResize = useCallback((delta: number) => {
    setTreePaneWidth((w) => Math.max(120, Math.min(500, w + delta)));
  }, []);

  const handlePreviewResize = useCallback((delta: number) => {
    setPreviewPaneWidth((w) => Math.max(200, Math.min(600, w - delta)));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
      } else if (e.key === " ") {
        e.preventDefault();
        setShowPreview((p) => !p);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCopy, handleCut, handlePaste, selectAll, clearSelection, selected, showDeleteDialog]);

  // Update preview when selection changes
  useEffect(() => {
    if (selected.size === 1) {
      const name = Array.from(selected)[0];
      const entry = entries.find((e) => e.name === name);
      if (entry) setPreviewEntry(entry);
    }
  }, [selected, entries]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <Toolbar
        currentPath={currentPath}
        onNavigate={navigate}
        onGoUp={goUp}
        onNewFolder={handleMkdir}
        onUpload={handleUpload}
        onRefresh={refresh}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((p) => !p)}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tree pane */}
        <div className="flex-shrink-0" style={{ width: treePaneWidth }}>
          <TreePane shares={shares} currentPath={currentPath} onNavigate={navigate} />
        </div>

        <ResizeHandle onResize={handleTreeResize} />

        {/* File list */}
        <div className="flex-1 min-w-0">
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
              onPreview={handlePreview}
              onRename={handleRename}
              onDrop={handleUpload}
              onCopy={handleCopy}
              onCut={handleCut}
              onPaste={handlePaste}
              onDelete={() => setShowDeleteDialog(true)}
            />
          )}
        </div>

        {/* Preview pane */}
        {showPreview && (
          <>
            <ResizeHandle onResize={handlePreviewResize} />
            <div className="flex-shrink-0" style={{ width: previewPaneWidth }}>
              <PreviewPane entry={previewEntry} currentPath={currentPath} />
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <StatusBar entries={entries} selected={selected} clipboard={clipboard} onPaste={handlePaste} />

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
    </div>
  );
}
