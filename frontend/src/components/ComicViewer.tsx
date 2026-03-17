import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchZipPages, zipPageUrl } from "../api/client";

interface ComicViewerProps {
  filePath: string;
  onClose: () => void;
}

export default function ComicViewer({ filePath, onClose }: ComicViewerProps) {
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [rtl, setRtl] = useState(true);
  const [spreadMode, setSpreadMode] = useState(() => window.innerWidth >= 768);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const toolbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [landscapePages, setLandscapePages] = useState<Set<number>>(new Set());

  // Filename for display
  const filename = filePath.split("/").pop() || filePath;

  // Fetch page list
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchZipPages(filePath)
      .then((data: { total: number }) => {
        if (data.total === 0) {
          setError("No image files found in this archive");
          return;
        }
        setTotal(data.total);
        setCurrentPage(0);
        setLandscapePages(new Set());
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filePath]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Track landscape pages
  const markLandscape = useCallback((pageIndex: number) => {
    setLandscapePages((prev) => {
      if (prev.has(pageIndex)) return prev;
      const next = new Set(prev);
      next.add(pageIndex);
      return next;
    });
  }, []);

  // Compute spread layout: array of [pageIndex] or [pageIndex, pageIndex]
  const spreads = useMemo(() => {
    if (!spreadMode || total === 0) {
      return Array.from({ length: total }, (_, i) => [i]);
    }

    const result: number[][] = [];
    // First page (cover) is always alone
    if (total > 0) {
      result.push([0]);
    }

    let i = 1;
    while (i < total) {
      if (landscapePages.has(i)) {
        result.push([i]);
        i++;
      } else if (i + 1 < total && !landscapePages.has(i + 1)) {
        result.push([i, i + 1]);
        i += 2;
      } else {
        result.push([i]);
        i++;
      }
    }
    return result;
  }, [spreadMode, total, landscapePages]);

  // Current spread index
  const currentSpreadIndex = useMemo(() => {
    for (let i = 0; i < spreads.length; i++) {
      if (spreads[i].includes(currentPage)) return i;
    }
    return 0;
  }, [spreads, currentPage]);

  const currentSpread = spreads[currentSpreadIndex] || [0];

  const goToSpread = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, spreads.length - 1));
    setCurrentPage(spreads[clamped][0]);
  }, [spreads]);

  const goPrev = useCallback(() => {
    goToSpread(currentSpreadIndex - 1);
  }, [currentSpreadIndex, goToSpread]);

  const goNext = useCallback(() => {
    goToSpread(currentSpreadIndex + 1);
  }, [currentSpreadIndex, goToSpread]);

  // Navigation by click area
  const handleAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = rect.width / 2;

    if (x < half) {
      // Left side clicked
      if (rtl) goNext(); else goPrev();
    } else {
      // Right side clicked
      if (rtl) goPrev(); else goNext();
    }
  }, [rtl, goNext, goPrev]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (rtl) goNext(); else goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (rtl) goPrev(); else goNext();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose, goPrev, goNext, rtl]);

  // Toolbar auto-hide
  const showToolbar = useCallback(() => {
    setToolbarVisible(true);
    if (toolbarTimer.current) clearTimeout(toolbarTimer.current);
    toolbarTimer.current = setTimeout(() => setToolbarVisible(false), 2000);
  }, []);

  useEffect(() => {
    showToolbar();
    return () => {
      if (toolbarTimer.current) clearTimeout(toolbarTimer.current);
    };
  }, [showToolbar]);

  const handleMouseMove = useCallback(() => {
    showToolbar();
  }, [showToolbar]);

  const handleTouchStart = useCallback(() => {
    showToolbar();
  }, [showToolbar]);

  // Prefetch next pages
  useEffect(() => {
    if (total === 0) return;
    const toPrefetch: number[] = [];
    for (let s = currentSpreadIndex + 1; s <= Math.min(currentSpreadIndex + 2, spreads.length - 1); s++) {
      toPrefetch.push(...spreads[s]);
    }
    toPrefetch.forEach((idx) => {
      const img = new Image();
      img.src = zipPageUrl(filePath, idx);
    });
  }, [currentSpreadIndex, spreads, filePath, total]);

  // Page display info
  const pageDisplay = useMemo(() => {
    if (currentSpread.length === 2) {
      return `${currentSpread[0] + 1}-${currentSpread[1] + 1} / ${total}`;
    }
    return `${currentSpread[0] + 1} / ${total}`;
  }, [currentSpread, total]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.95)" }}>
        <div className="text-white/40 text-sm">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4" style={{ background: "rgba(0,0,0,0.95)" }}>
        <div className="text-red-400 text-sm">Error: {error}</div>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "rgba(0,0,0,0.95)" }}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
    >
      {/* Toolbar */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-3 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.6)",
          opacity: toolbarVisible ? 1 : 0,
          pointerEvents: toolbarVisible ? "auto" : "none",
        }}
      >
        {/* Filename */}
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate">{filename}</div>
        </div>

        {/* Page counter */}
        <div className="text-white/60 text-xs font-mono flex-shrink-0">
          {pageDisplay}
        </div>

        {/* Spread/Single toggle */}
        <button
          onClick={() => setSpreadMode((s) => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer transition-colors"
          title={spreadMode ? "Switch to single page" : "Switch to spread view"}
        >
          {spreadMode ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="8" height="18" rx="1" />
              <rect x="14" y="3" width="8" height="18" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="3" width="14" height="18" rx="1" />
            </svg>
          )}
          {spreadMode ? "Spread" : "Single"}
        </button>

        {/* RTL/LTR toggle */}
        <button
          onClick={() => setRtl((r) => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer transition-colors"
          title={rtl ? "Reading right-to-left (manga)" : "Reading left-to-right"}
        >
          {rtl ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
              <line x1="20" y1="12" x2="9" y2="12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
              <line x1="4" y1="12" x2="15" y2="12" />
            </svg>
          )}
          {rtl ? "RTL" : "LTR"}
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/15 text-white/70 hover:text-white cursor-pointer transition-colors text-lg"
          title="Close (Esc)"
        >
          &times;
        </button>
      </div>

      {/* Page display area */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden cursor-pointer select-none"
        onClick={handleAreaClick}
      >
        {currentSpread.length === 2 ? (
          <div className={`flex items-center justify-center h-full gap-0 ${rtl ? "flex-row-reverse" : "flex-row"}`}>
            <PageImage
              filePath={filePath}
              pageIndex={currentSpread[0]}
              onLandscape={markLandscape}
              className="max-h-full object-contain"
              style={{ maxWidth: "50vw" }}
            />
            <PageImage
              filePath={filePath}
              pageIndex={currentSpread[1]}
              onLandscape={markLandscape}
              className="max-h-full object-contain"
              style={{ maxWidth: "50vw" }}
            />
          </div>
        ) : (
          <PageImage
            filePath={filePath}
            pageIndex={currentSpread[0]}
            onLandscape={markLandscape}
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      {/* Bottom slider bar */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.6)",
          opacity: toolbarVisible ? 1 : 0,
          pointerEvents: toolbarVisible ? "auto" : "none",
        }}
      >
        <input
          type="range"
          min={0}
          max={spreads.length - 1}
          value={currentSpreadIndex}
          onChange={(e) => goToSpread(Number(e.target.value))}
          className="w-full h-1.5 appearance-none bg-white/20 rounded-full cursor-pointer"
          style={{
            direction: rtl ? "rtl" : "ltr",
            accentColor: "white",
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

// --- Page Image Component ---

function PageImage({
  filePath,
  pageIndex,
  onLandscape,
  className,
  style,
}: {
  filePath: string;
  pageIndex: number;
  onLandscape: (pageIndex: number) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = zipPageUrl(filePath, pageIndex);

  // Reset loaded state when page changes
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true);
    const img = e.currentTarget;
    if (img.naturalWidth > img.naturalHeight) {
      onLandscape(pageIndex);
    }
  }, [pageIndex, onLandscape]);

  return (
    <div className="relative flex items-center justify-center h-full">
      {!loaded && (
        <div className="absolute text-white/40 text-sm">Loading...</div>
      )}
      <img
        src={src}
        alt={`Page ${pageIndex + 1}`}
        draggable={false}
        onLoad={handleLoad}
        className={`select-none transition-opacity duration-200 ${className || ""}`}
        style={{
          ...style,
          opacity: loaded ? 1 : 0,
        }}
      />
    </div>
  );
}
