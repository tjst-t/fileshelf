interface TitleBarProps {
  username: string;
  version: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export default function TitleBar({ username, version, theme, onToggleTheme }: TitleBarProps) {
  const initial = username ? username[0].toUpperCase() : "?";

  return (
    <div className="h-12 bg-surface-alt border-b border-border flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-lg">📚</span>
        <span className="font-mono font-semibold text-[15px] text-text tracking-tight">fileshelf</span>
        <span className="text-[11px] text-text-faint font-mono ml-1">{version}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleTheme}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-raised text-text-dim hover:text-text transition-colors cursor-pointer"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "\u2600\uFE0F" : "\u{1F319}"}
        </button>
        <span className="text-xs text-text-dim font-mono">{username}</span>
        <div className="w-7 h-7 rounded-full bg-linear-to-br from-accent to-success flex items-center justify-center text-xs font-semibold text-bg">
          {initial}
        </div>
      </div>
    </div>
  );
}
