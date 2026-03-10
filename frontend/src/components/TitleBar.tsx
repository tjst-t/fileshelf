interface TitleBarProps {
  username: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onToggleDrawer?: () => void;
  isMobile?: boolean;
}

export default function TitleBar({ username, theme, onToggleTheme, onToggleDrawer, isMobile }: TitleBarProps) {
  const initial = username ? username[0].toUpperCase() : "?";

  return (
    <div className="h-12 bg-surface-alt border-b border-border flex items-center justify-between px-3 md:px-4 flex-shrink-0">
      <div className="flex items-center gap-2">
        {isMobile && (
          <button
            onClick={onToggleDrawer}
            className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-surface-raised text-text-muted hover:text-text transition-colors cursor-pointer -ml-1"
            title="Toggle sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
        )}
        <span className="text-lg">📚</span>
        <span className="font-mono font-semibold text-[15px] text-text tracking-tight">fileshelf</span>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={onToggleTheme}
          className="w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded hover:bg-surface-raised text-text-dim hover:text-text transition-colors cursor-pointer"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}"}
        </button>
        {!isMobile && <span className="text-xs text-text-dim font-mono">{username}</span>}
        <div className="w-7 h-7 rounded-full bg-linear-to-br from-accent to-success flex items-center justify-center text-xs font-semibold text-bg">
          {initial}
        </div>
      </div>
    </div>
  );
}
