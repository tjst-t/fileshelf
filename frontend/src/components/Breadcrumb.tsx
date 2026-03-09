interface BreadcrumbProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export default function Breadcrumb({ currentPath, onNavigate }: BreadcrumbProps) {
  const parts = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-1 text-sm text-text-muted overflow-x-auto whitespace-nowrap">
      <button
        className="hover:text-accent px-1"
        onClick={() => {
          onNavigate("");
        }}
      >
        /
      </button>
      {parts.map((part, i) => {
        const path = "/" + parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        return (
          <span key={path} className="flex items-center gap-1">
            <span className="text-border">/</span>
            <button
              className={`px-1 hover:text-accent ${isLast ? "text-text font-medium" : ""}`}
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
