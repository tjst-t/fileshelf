interface TitleBarProps {
  username: string;
}

export default function TitleBar({ username }: TitleBarProps) {
  const initial = username ? username[0].toUpperCase() : "?";

  return (
    <div className="h-12 bg-surface-alt border-b border-border flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-lg">📚</span>
        <span className="font-mono font-semibold text-[15px] text-text tracking-tight">fileshelf</span>
        <span className="text-[11px] text-text-faint font-mono ml-1">v0.1.0</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-dim font-mono">{username}</span>
        <div className="w-7 h-7 rounded-full bg-linear-to-br from-accent to-success flex items-center justify-center text-xs font-semibold text-bg">
          {initial}
        </div>
      </div>
    </div>
  );
}
