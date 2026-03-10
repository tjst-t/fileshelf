import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  icon: string;
  label: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-surface border border-border rounded-lg shadow-xl py-1"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="h-px bg-border my-1" />
        ) : (
          <button
            key={i}
            className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-left hover:bg-surface-alt/70 ${
              item.disabled ? "opacity-40 cursor-default" : "cursor-pointer"
            } ${item.danger ? "text-danger" : "text-text"}`}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            disabled={item.disabled}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 text-center text-base">{item.icon}</span>
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <span className="text-xs text-text-muted font-mono">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  );
}
