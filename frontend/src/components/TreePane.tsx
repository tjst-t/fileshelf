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

  const hasChildren = node.children === null || (node.children && node.children.length > 0);

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 cursor-pointer select-none text-[13px] transition-all duration-150 ${
          isActive
            ? "bg-accent/18 text-text border-r-2 border-accent"
            : "text-text-muted border-r-2 border-transparent hover:bg-white/4"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px`, paddingTop: 4, paddingBottom: 4, paddingRight: 8 }}
        onClick={() => {
          onNavigate(node.path);
          onToggle(node.path);
        }}
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
          {node.loading ? "\u21BB" : "\u25B6"}
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

      // Read current state synchronously via a ref-like pattern
      let needsFetch = false;
      setNodes((prev) => {
        const target = findNode(prev);
        if (!target) return prev;

        if (target.expanded) {
          // Collapse
          const collapse = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => {
              if (n.path === path) return { ...n, expanded: false };
              if (n.children) return { ...n, children: collapse(n.children) };
              return n;
            });
          return collapse(prev);
        }

        if (target.children !== null) {
          // Already loaded, just expand
          const expand = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => {
              if (n.path === path) return { ...n, expanded: true };
              if (n.children) return { ...n, children: expand(n.children) };
              return n;
            });
          return expand(prev);
        }

        // Need to load children
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

  return (
    <div className="h-full overflow-y-auto bg-surface border-r border-border">
      <div className="px-3 py-2 text-[10px] font-semibold text-text-faint uppercase tracking-[0.1em] border-b border-border">
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
