interface BreadcrumbProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  searchQuery?: string;
  onClearSearch?: () => void;
}

export default function Breadcrumb({ currentPath, onNavigate, searchQuery, onClearSearch }: BreadcrumbProps) {
  if (searchQuery) {
    return (
      <div className="flex items-center gap-1 text-[13px] font-mono text-text-dim overflow-x-auto whitespace-nowrap px-1">
        <span className="text-text">検索結果：</span>
        <span className="text-accent font-semibold">{searchQuery}</span>
        {onClearSearch && (
          <button
            className="ml-1 px-1.5 py-0.5 rounded text-text-muted hover:text-text hover:bg-surface-raised cursor-pointer text-xs"
            onClick={onClearSearch}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  const parts = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-0.5 text-[13px] font-mono text-text-dim overflow-x-auto whitespace-nowrap px-1">
      <button
        className="text-accent px-1 py-0.5 rounded cursor-pointer hover:bg-accent/12"
        onClick={() => onNavigate("")}
      >
        shares
      </button>
      {parts.map((part, i) => {
        const path = "/" + parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        return (
          <span key={path} className="flex items-center">
            <span className="text-text-dark mx-0.5">/</span>
            <button
              className={`px-1 py-0.5 rounded cursor-pointer hover:bg-accent/12 ${
                isLast ? "text-text" : "text-accent"
              }`}
              onClick={() => onNavigate(path)}
            >
              {part}
            </button>
          </span>
        );
      })}
    </div>
  );
}
