interface BreadcrumbProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export default function Breadcrumb({ currentPath, onNavigate }: BreadcrumbProps) {
  const parts = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-0.5 text-[13px] font-mono text-text-dim overflow-x-auto whitespace-nowrap px-1">
      <button
        className="text-accent px-1 py-0.5 rounded cursor-pointer hover:bg-accent/12"
        onClick={() => onNavigate("")}
      >
        /
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
