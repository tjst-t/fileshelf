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
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current || isMobile) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y, isMobile]);

  // Mobile: bottom sheet style
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
        <div
          ref={menuRef}
          className="fixed bottom-0 left-0 right-0 z-50 bg-surface-raised border-t border-border-subtle rounded-t-xl py-2 pb-[env(safe-area-inset-bottom,8px)]"
          style={{ boxShadow: "0 -4px 32px rgba(0,0,0,0.3)" }}
        >
          <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-2" />
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="h-px bg-border-subtle my-1" />
            ) : (
              <button
                key={i}
                className={`w-full flex items-center justify-between gap-3 text-sm text-left cursor-pointer active:bg-accent/12 min-h-[48px] ${
                  item.disabled ? "opacity-50 cursor-default" : ""
                } ${item.danger ? "text-danger" : "text-text"}`}
                style={{ padding: "10px 20px" }}
                onClick={() => {
                  if (!item.disabled) {
                    item.action();
                    onClose();
                  }
                }}
                disabled={item.disabled}
              >
                <div className="flex items-center gap-3">
                  <span className="w-[22px] text-center text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.shortcut && (
                  <span className="text-xs text-text-faint font-mono">{item.shortcut}</span>
                )}
              </button>
            )
          )}
        </div>
      </>
    );
  }

  // Desktop: positioned dropdown
  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[210px] bg-surface-raised border border-border-subtle rounded-md py-1"
      style={{ left: x, top: y, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="h-px bg-border-subtle my-1" />
        ) : (
          <button
            key={i}
            className={`w-full flex items-center justify-between gap-2.5 text-[13px] text-left cursor-pointer ${
              item.disabled ? "opacity-50 cursor-default" : "hover:bg-accent/8"
            } ${item.danger ? "text-danger" : "text-text"}`}
            style={{ padding: "7px 14px" }}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            disabled={item.disabled}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-[18px] text-center text-sm">{item.icon}</span>
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <span className="text-[11px] text-text-faint font-mono">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  );
}
