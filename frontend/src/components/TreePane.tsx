import { useState, useCallback, useEffect } from "react";
import type { Share, FileEntry } from "../api/client";
import { fetchFiles } from "../api/client";

interface TreePaneProps {
  shares: Share[];
  currentPath: string;
  onNavigate: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[] | null;
  expanded: boolean;
  loading: boolean;
}

function TreeItem({
  node,
  currentPath,
  onNavigate,
  onToggle,
  depth,
}: {
  node: TreeNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  onToggle: (path: string) => void;
  depth: number;
}) {
  const isActive = currentPath === node.path;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-sm hover:bg-surface-alt/50 ${
          isActive ? "bg-surface-alt text-accent" : "text-text"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onNavigate(node.path);
          if (!node.expanded) onToggle(node.path);
        }}
      >
        <button
          className="w-4 h-4 flex items-center justify-center text-text-muted flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.path);
          }}
        >
          {node.loading ? (
            <span className="animate-spin">{"\u21BB"}</span>
          ) : node.expanded ? (
            "\u25BE"
          ) : (
            "\u25B8"
          )}
        </button>
        <span className="mr-1">{"\uD83D\uDCC1"}</span>
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
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreePane({ shares, currentPath, onNavigate }: TreePaneProps) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);

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

  const toggleNode = useCallback(
    async (path: string) => {
      const updateNode = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.path === path) {
            if (n.expanded) {
              return { ...n, expanded: false };
            }
            if (n.children !== null) {
              return { ...n, expanded: true };
            }
            // Load children
            return { ...n, loading: true };
          }
          if (n.children) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });

      setNodes((prev) => updateNode(prev));

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

        const setChildren = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((n) => {
            if (n.path === path) {
              return { ...n, children, expanded: true, loading: false };
            }
            if (n.children) {
              return { ...n, children: setChildren(n.children) };
            }
            return n;
          });

        setNodes((prev) => setChildren(prev));
      } catch {
        const clearLoading = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((n) => {
            if (n.path === path) return { ...n, loading: false };
            if (n.children) return { ...n, children: clearLoading(n.children) };
            return n;
          });
        setNodes((prev) => clearLoading(prev));
      }
    },
    []
  );

  return (
    <div className="h-full overflow-y-auto bg-surface border-r border-border">
      <div className="px-3 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider border-b border-border">
        Shares
      </div>
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          currentPath={currentPath}
          onNavigate={onNavigate}
          onToggle={toggleNode}
          depth={0}
        />
      ))}
    </div>
  );
}
