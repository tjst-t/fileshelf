import { useState, useCallback, useEffect, useRef } from "react";
import type { Share, FileEntry } from "../api/client";
import type { ClipboardState } from "../hooks/useFileExplorer";
import { fetchFiles } from "../api/client";
import ContextMenu from "./ContextMenu";
import type { ContextMenuItem } from "./ContextMenu";

interface TreePaneProps {
  shares: Share[];
  currentPath: string;
  clipboard: ClipboardState | null;
  onNavigate: (path: string) => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onRename: (oldName: string, newName: string) => void;
  onSelectForTree: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[] | null;
  expanded: boolean;
  loading: boolean;
}

function isShareRoot(path: string): boolean {
  // share root is like "/media" — only one segment after leading slash
  const parts = path.replace(/^\//, "").split("/");
  return parts.length === 1;
}

function TreeItem({
  node,
  currentPath,
  onNavigate,
  onToggle,
  onContextMenu,
  depth,
}: {
  node: TreeNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  onToggle: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  depth: number;
}) {
  const isActive = currentPath === node.path;

  const hasChildren = node.children === null || (node.children && node.children.length > 0);

  return (
    <div>
      <div
        data-tree-path={node.path}
        className={`flex items-center gap-1.5 cursor-pointer select-none text-[13px] transition-all duration-150 ${
          isActive
            ? "bg-accent/18 text-text border-r-2 border-accent"
            : "text-text-muted border-r-2 border-transparent hover:bg-hover-row"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px`, paddingTop: 4, paddingBottom: 4, paddingRight: 8 }}
        onClick={() => {
          onNavigate(node.path);
          onToggle(node.path);
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span
          className="w-3.5 text-center text-text-dim flex-shrink-0 inline-block transition-transform duration-150"
          style={{
            fontSize: 10,
            transform: node.expanded ? "rotate(90deg)" : "rotate(0deg)",
            visibility: hasChildren ? "visible" : "hidden",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path);
          }}
        >
          {"\u25B6"}
        </span>
        <span className="text-sm">{node.expanded ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}</span>
        <span className="truncate">{node.name}</span>
      </div>
      {node.expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              currentPath={currentPath}
              onNavigate={onNavigate}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreePane({
  shares,
  currentPath,
  clipboard,
  onNavigate,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onRename,
  onSelectForTree,
}: TreePaneProps) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNodes(
      shares.map((s) => ({
        name: s.name,
        path: "/" + s.name,
        children: null,
        expanded: false,
        loading: false,
      }))
    );
  }, [shares]);

  // Auto-expand tree to match currentPath and scroll active node into view
  useEffect(() => {
    if (!currentPath || nodes.length === 0) return;

    // Build ancestor paths: "/media" → ["/media"], "/media/photos/trip" → ["/media", "/media/photos", "/media/photos/trip"]
    const segments = currentPath.replace(/^\//, "").split("/");
    const ancestors: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      ancestors.push("/" + segments.slice(0, i + 1).join("/"));
    }

    let cancelled = false;

    const expandPath = async () => {
      for (const ancestorPath of ancestors) {
        if (cancelled) return;

        // Check current state to see if we need to expand/fetch
        const needsWork = await new Promise<"fetch" | "expand" | "none">((resolve) => {
          setNodes((prev) => {
            const node = findNodeIn(prev, ancestorPath);
            if (!node) { resolve("none"); return prev; }
            if (node.expanded) { resolve("none"); return prev; }
            if (node.children !== null) {
              // Has children already, just expand
              resolve("expand");
              return updateNode(prev, ancestorPath, (n) => ({ ...n, expanded: true }));
            }
            // Needs fetch
            resolve("fetch");
            return prev;
          });
        });

        if (cancelled) return;

        if (needsWork === "fetch") {
          try {
            const entries: FileEntry[] = await fetchFiles(ancestorPath);
            if (cancelled) return;
            const children: TreeNode[] = entries
              .filter((e) => e.type === "dir")
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((e) => ({
                name: e.name,
                path: ancestorPath + "/" + e.name,
                children: null,
                expanded: false,
                loading: false,
              }));
            setNodes((prev) =>
              updateNode(prev, ancestorPath, (n) => ({ ...n, children, expanded: true, loading: false }))
            );
          } catch {
            // Stop expanding if fetch fails
            return;
          }
        }
      }

      // Scroll active node into view after expansion
      if (!cancelled) {
        requestAnimationFrame(() => {
          if (treeRef.current) {
            const el = treeRef.current.querySelector(`[data-tree-path="${CSS.escape(currentPath)}"]`);
            if (el) {
              el.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          }
        });
      }
    };

    expandPath();
    return () => { cancelled = true; };
  }, [currentPath, nodes.length]); // only re-run when path changes or shares load

  // Helper: find a node by path in the tree
  const findNodeIn = (nodes: TreeNode[], path: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children) {
        const found = findNodeIn(n.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper: update a single node by path
  const updateNode = (nodes: TreeNode[], path: string, updater: (n: TreeNode) => TreeNode): TreeNode[] =>
    nodes.map((n) => {
      if (n.path === path) return updater(n);
      if (n.children) return { ...n, children: updateNode(n.children, path, updater) };
      return n;
    });

  const toggleNode = useCallback(
    async (path: string) => {
      const findNode = (nodes: TreeNode[]): TreeNode | null => {
        for (const n of nodes) {
          if (n.path === path) return n;
          if (n.children) {
            const found = findNode(n.children);
            if (found) return found;
          }
        }
        return null;
      };

      let needsFetch = false;
      setNodes((prev) => {
        const target = findNode(prev);
        if (!target) return prev;

        if (target.expanded) {
          const collapse = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => {
              if (n.path === path) return { ...n, expanded: false };
              if (n.children) return { ...n, children: collapse(n.children) };
              return n;
            });
          return collapse(prev);
        }

        if (target.children !== null) {
          const expand = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => {
              if (n.path === path) return { ...n, expanded: true };
              if (n.children) return { ...n, children: expand(n.children) };
              return n;
            });
          return expand(prev);
        }

        needsFetch = true;
        const setLoading = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((n) => {
            if (n.path === path) return { ...n, loading: true };
            if (n.children) return { ...n, children: setLoading(n.children) };
            return n;
          });
        return setLoading(prev);
      });

      if (!needsFetch) return;

      try {
        const entries: FileEntry[] = await fetchFiles(path);
        const children: TreeNode[] = entries
          .filter((e) => e.type === "dir")
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) => ({
            name: e.name,
            path: path + "/" + e.name,
            children: null,
            expanded: false,
            loading: false,
          }));

        setNodes((prev) => {
          const setChildren = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => {
              if (n.path === path) return { ...n, children, expanded: true, loading: false };
              if (n.children) return { ...n, children: setChildren(n.children) };
              return n;
            });
          return setChildren(prev);
        });
      } catch {
        setNodes((prev) => {
          const clearLoading = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => {
              if (n.path === path) return { ...n, loading: false };
              if (n.children) return { ...n, children: clearLoading(n.children) };
              return n;
            });
          return clearLoading(prev);
        });
      }
    },
    []
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNode) => {
      e.preventDefault();

      const isRoot = isShareRoot(node.path);
      // Select this folder in the file explorer for operations
      onSelectForTree(node.path);

      const items: ContextMenuItem[] = [];

      items.push({
        icon: "\u{1F4C2}",
        label: "Open",
        action: () => onNavigate(node.path),
      });

      items.push({
        icon: "\u2B07\uFE0F",
        label: "Download as zip",
        action: () => {
          const a = document.createElement("a");
          a.href = `/api/files/download-zip?paths=${encodeURIComponent(node.path)}`;
          a.download = "";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        },
      });

      if (!isRoot) {
        items.push({ icon: "", label: "", action: () => {}, divider: true });

        items.push({
          icon: "\u{1F4CB}",
          label: "Copy",
          shortcut: "\u2318C",
          action: onCopy,
        });
        items.push({
          icon: "\u2702\uFE0F",
          label: "Cut",
          shortcut: "\u2318X",
          action: onCut,
        });
      }

      items.push({
        icon: "\u{1F4CB}",
        label: "Paste here",
        shortcut: "\u2318V",
        action: onPaste,
        disabled: !clipboard,
      });

      if (!isRoot) {
        items.push({ icon: "", label: "", action: () => {}, divider: true });

        // Extract parent path and folder name for rename
        const lastSlash = node.path.lastIndexOf("/");
        const folderName = node.path.substring(lastSlash + 1);

        items.push({
          icon: "\u270F\uFE0F",
          label: "Rename",
          action: () => {
            const newName = prompt("Rename folder:", folderName);
            if (newName && newName !== folderName) {
              onRename(folderName, newName);
            }
          },
        });

        items.push({
          icon: "\u{1F5D1}",
          label: "Delete",
          danger: true,
          action: onDelete,
        });
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [clipboard, onNavigate, onCopy, onCut, onPaste, onDelete, onRename, onSelectForTree]
  );

  return (
    <div ref={treeRef} className="h-full overflow-y-auto bg-surface border-r border-border">
      <div className="px-3 py-2 flex items-center justify-between border-b border-border">
        <span className="text-[10px] font-semibold text-text-faint uppercase tracking-[0.1em]">
          Shares
        </span>
        <button
          className="w-5 h-5 flex items-center justify-center rounded text-text-dim hover:text-text hover:bg-hover-row transition-colors cursor-pointer"
          title="Collapse all"
          onClick={() => {
            setNodes((prev) => {
              const collapseAll = (nodes: TreeNode[]): TreeNode[] =>
                nodes.map((n) => ({
                  ...n,
                  expanded: false,
                  children: n.children ? collapseAll(n.children) : null,
                }));
              return collapseAll(prev);
            });
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <line x1="5" y1="8" x2="11" y2="8" />
          </svg>
        </button>
      </div>
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          currentPath={currentPath}
          onNavigate={onNavigate}
          onToggle={toggleNode}
          onContextMenu={handleContextMenu}
          depth={0}
        />
      ))}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
