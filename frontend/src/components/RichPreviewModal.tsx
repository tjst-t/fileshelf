import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { FileEntry } from "../api/client";
import { previewUrl, downloadUrl } from "../api/client";
import { formatSize } from "../utils/format";
import { getExt, fileType, isPreviewable } from "../utils/fileTypes";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import java from "highlight.js/lib/languages/java";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import markdown from "highlight.js/lib/languages/markdown";
import makefile from "highlight.js/lib/languages/makefile";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import kotlin from "highlight.js/lib/languages/kotlin";
import scala from "highlight.js/lib/languages/scala";
import swift from "highlight.js/lib/languages/swift";
import lua from "highlight.js/lib/languages/lua";
import r from "highlight.js/lib/languages/r";
import perl from "highlight.js/lib/languages/perl";
import plaintext from "highlight.js/lib/languages/plaintext";
import properties from "highlight.js/lib/languages/properties";
import gradle from "highlight.js/lib/languages/gradle";
import cmake from "highlight.js/lib/languages/cmake";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("java", java);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("makefile", makefile);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("scala", scala);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("lua", lua);
hljs.registerLanguage("r", r);
hljs.registerLanguage("perl", perl);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("properties", properties);
hljs.registerLanguage("gradle", gradle);
hljs.registerLanguage("cmake", cmake);

// Map file extensions to highlight.js language names
function hljsLang(name: string): string | undefined {
  const ext = getExt(name);
  const map: Record<string, string> = {
    js: "javascript", ts: "typescript", tsx: "typescript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    java: "java", kt: "kotlin", scala: "scala", swift: "swift",
    sh: "bash", bash: "bash", lua: "lua", r: "r", pl: "perl",
    php: "php", sql: "sql", css: "css", html: "xml", htm: "xml", xml: "xml",
    json: "json", yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini",
    md: "markdown", makefile: "makefile", dockerfile: "dockerfile",
    vue: "xml", svelte: "xml", csv: "plaintext", log: "plaintext",
    txt: "plaintext", conf: "ini", cfg: "ini", properties: "properties",
    gradle: "gradle", cmake: "cmake",
  };
  return map[ext];
}

// --- Props ---

interface RichPreviewModalProps {
  entry: FileEntry;
  currentPath: string;
  /** All entries in the current directory (for gallery navigation) */
  allEntries: FileEntry[];
  onClose: () => void;
  onNavigateEntry: (entry: FileEntry) => void;
}

export default function RichPreviewModal({
  entry,
  currentPath,
  allEntries,
  onClose,
  onNavigateEntry,
}: RichPreviewModalProps) {
  const filePath = currentPath + "/" + entry.name;
  const url = previewUrl(filePath);
  const dlUrl = downloadUrl(filePath);
  const type = fileType(entry.name);

  // Gallery: previewable files in order
  const galleryEntries = useMemo(
    () => allEntries.filter((e) => e.type === "file" && isPreviewable(e.name)),
    [allEntries]
  );
  const currentIndex = galleryEntries.findIndex((e) => e.name === entry.name);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < galleryEntries.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigateEntry(galleryEntries[currentIndex - 1]);
  }, [hasPrev, galleryEntries, currentIndex, onNavigateEntry]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigateEntry(galleryEntries[currentIndex + 1]);
  }, [hasNext, galleryEntries, currentIndex, onNavigateEntry]);

  // Keyboard navigation
  // Arrow keys only for gallery nav on image/audio types (text/pdf/video need arrows for scrolling/seeking)
  const enableArrowNav = type === "image" || type === "audio";
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (enableArrowNav && e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (enableArrowNav && e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose, goPrev, goNext, enableArrowNav]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const triggerDownload = () => {
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: "rgba(0,0,0,0.85)" }}>
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: "rgba(0,0,0,0.4)" }}>
        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate">{entry.name}</div>
          <div className="text-white/50 text-xs font-mono">{formatSize(entry.size)}</div>
        </div>

        {/* Gallery counter */}
        {galleryEntries.length > 1 && (
          <div className="text-white/50 text-xs flex-shrink-0">
            {currentIndex + 1} / {galleryEntries.length}
          </div>
        )}

        {/* Download */}
        <button
          onClick={triggerDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer transition-colors"
          title="Download"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download
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

      {/* Content (backdrop click closes) */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative min-h-0"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Prev/Next arrows */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white cursor-pointer transition-colors"
            title="Previous"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white cursor-pointer transition-colors"
            title="Next"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        )}

        {/* Viewer */}
        <div className="w-full h-full flex items-center justify-center p-4 md:p-8">
          {type === "image" && <ImageViewer src={url} alt={entry.name} />}
          {type === "text" && <CodeViewer url={url} filename={entry.name} />}
          {type === "pdf" && <PdfViewer url={url} />}
          {type === "video" && <VideoPlayer src={url} />}
          {type === "audio" && <AudioPlayer src={url} filename={entry.name} />}
          {type === "unknown" && (
            <div className="text-white/40 text-sm text-center">
              <div className="text-4xl mb-3">📄</div>
              No preview available for this file type
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Image Viewer with zoom/pan ---

function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);

  // Reset on src change
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setLoaded(false);
  }, [src]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.1), 20));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
  }, [translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setTranslate({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // Touch support for pinch zoom and pan
  const touchRef = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = {
        dist: Math.hypot(dx, dy),
        scale,
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      setDragging(true);
      setDragStart({ x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y });
    }
  }, [scale, translate]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(Math.max(touchRef.current.scale * (dist / touchRef.current.dist), 0.1), 20);
      setScale(newScale);
    } else if (e.touches.length === 1 && dragging) {
      setTranslate({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    }
  }, [dragging, dragStart]);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    touchRef.current = null;
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div
        className="flex-1 w-full flex items-center justify-center overflow-hidden"
        style={{ cursor: dragging ? "grabbing" : scale > 1 ? "grab" : "default" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          className="select-none transition-opacity duration-200"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            opacity: loaded ? 1 : 0,
          }}
        />
        {!loaded && (
          <div className="absolute text-white/40 text-sm">Loading...</div>
        )}
      </div>
      {/* Zoom controls */}
      <div className="flex items-center gap-2 mt-3 flex-shrink-0">
        <button
          onClick={() => setScale((s) => Math.max(s * 0.7, 0.1))}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer"
        >
          -
        </button>
        <button
          onClick={resetZoom}
          className="px-3 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white/70 text-xs cursor-pointer font-mono min-w-[60px]"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={() => setScale((s) => Math.min(s * 1.4, 20))}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white text-sm cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
}

// --- Code Viewer with syntax highlighting ---

const MAX_PREVIEW_LINES = 10000;

function CodeViewer({ url, filename }: { url: string; filename: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMarkdownRendered, setIsMarkdownRendered] = useState(false);
  const isMd = getExt(filename) === "md";

  useEffect(() => {
    setContent(null);
    setTruncated(false);
    setError(null);
    setIsMarkdownRendered(false);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.text();
      })
      .then((text) => {
        const lines = text.split("\n");
        if (lines.length > MAX_PREVIEW_LINES) {
          setContent(lines.slice(0, MAX_PREVIEW_LINES).join("\n"));
          setTruncated(true);
        } else {
          setContent(text);
        }
      })
      .catch((e) => setError(e.message));
  }, [url]);

  const highlightedHtml = useMemo(() => {
    if (content === null) return "";
    const lang = hljsLang(filename);
    if (lang) {
      try {
        return hljs.highlight(content, { language: lang }).value;
      } catch { /* fallback */ }
    }
    // Escape HTML for plain text
    return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }, [content, filename]);

  if (error) {
    return <div className="text-danger text-sm p-4">Error: {error}</div>;
  }
  if (content === null) {
    return <div className="text-white/40 text-sm">Loading...</div>;
  }

  const lineCount = content.split("\n").length;

  // Markdown rendered view
  if (isMd && isMarkdownRendered) {
    return (
      <div className="w-full h-full flex flex-col max-w-4xl mx-auto">
        <div className="flex justify-end mb-2 flex-shrink-0">
          <button
            onClick={() => setIsMarkdownRendered(false)}
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/70 text-xs cursor-pointer"
          >
            Source
          </button>
        </div>
        <div
          className="flex-1 overflow-auto rounded-lg bg-[#1e1e2e] p-6 text-white/90 text-sm leading-relaxed"
          style={{ maxHeight: "100%" }}
        >
          <MarkdownRenderer content={content} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col max-w-5xl mx-auto">
      {isMd && (
        <div className="flex justify-end mb-2 flex-shrink-0">
          <button
            onClick={() => setIsMarkdownRendered(true)}
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/70 text-xs cursor-pointer"
          >
            Rendered
          </button>
        </div>
      )}
      <div
        className="flex-1 overflow-auto rounded-lg bg-[#1e1e2e]"
        style={{ maxHeight: "100%" }}
      >
        <div className="flex min-h-full">
          {/* Line numbers gutter */}
          <div
            className="flex-shrink-0 text-right text-white/20 text-xs font-mono select-none border-r border-white/5 py-3 px-3"
            style={{ lineHeight: "20px" }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          {/* Code content */}
          <pre
            className="flex-1 text-white/85 text-[13px] font-mono py-3 px-4 m-0 whitespace-pre-wrap break-all overflow-x-auto"
            style={{ lineHeight: "20px" }}
          >
            <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          </pre>
        </div>
        {truncated && (
          <div className="text-white/40 text-xs text-center py-3 border-t border-white/5">
            Showing first {MAX_PREVIEW_LINES.toLocaleString()} lines. Download the file to see the full content.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Simple Markdown Renderer ---

function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inList = false;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Safe: input `s` is already HTML-escaped via esc(), so $1 captures
  // cannot contain raw HTML. Replacements only inject known-safe tags.
  const inlineFormat = (s: string) => {
    return s
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;font-size:0.9em">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>");
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        let highlighted = esc(codeLines.join("\n"));
        if (codeLang) {
          try {
            highlighted = hljs.highlight(codeLines.join("\n"), { language: codeLang }).value;
          } catch { /* fallback */ }
        }
        result.push(`<pre style="background:rgba(0,0,0,0.3);padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.5"><code>${highlighted}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
      } else {
        if (inList) { result.push("</ul>"); inList = false; }
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headers
    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      if (inList) { result.push("</ul>"); inList = false; }
      const level = hMatch[1].length;
      const sizes = ["1.8em", "1.5em", "1.25em", "1.1em", "1em", "0.9em"];
      result.push(`<h${level} style="font-size:${sizes[level-1]};font-weight:600;margin:16px 0 8px 0">${inlineFormat(esc(hMatch[2]))}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      if (inList) { result.push("</ul>"); inList = false; }
      result.push('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:16px 0" />');
      continue;
    }

    // List items
    const liMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (liMatch) {
      if (!inList) { result.push('<ul style="padding-left:24px;margin:4px 0">'); inList = true; }
      result.push(`<li style="margin:2px 0">${inlineFormat(esc(liMatch[1]))}</li>`);
      continue;
    }

    if (inList && line.trim() === "") {
      result.push("</ul>");
      inList = false;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      result.push("<br />");
      continue;
    }

    // Paragraph
    result.push(`<p style="margin:4px 0">${inlineFormat(esc(line))}</p>`);
  }

  if (inList) result.push("</ul>");
  if (inCodeBlock) {
    result.push(`<pre style="background:rgba(0,0,0,0.3);padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:13px"><code>${esc(codeLines.join("\n"))}</code></pre>`);
  }

  return result.join("\n");
}

// --- PDF Viewer ---

function PdfViewer({ url }: { url: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <iframe
        src={url}
        className="w-full h-full rounded-lg border border-white/10"
        title="PDF Preview"
        style={{ background: "white" }}
      />
    </div>
  );
}

// --- Video Player ---

function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState(1);
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const cycleSpeed = () => {
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
      <video
        ref={videoRef}
        src={src}
        controls
        className="max-w-full max-h-[calc(100%-48px)] rounded-lg"
        style={{ background: "black" }}
      />
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={cycleSpeed}
          className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/70 text-xs cursor-pointer font-mono"
          title="Playback speed"
        >
          {speed}x
        </button>
        <button
          onClick={toggleFullscreen}
          className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/70 text-xs cursor-pointer"
          title="Fullscreen"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// --- Audio Player ---

function AudioPlayer({ src, filename }: { src: string; filename: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const cycleSpeed = () => {
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const formatTime = (t: number) => {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const seekFromX = (clientX: number, el: HTMLElement) => {
    if (!audioRef.current || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    seekFromX(e.clientX, e.currentTarget);
  };

  const handleTouchSeek = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      seekFromX(e.touches[0].clientX, e.currentTarget);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 w-full max-w-md mx-auto">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
      />

      {/* Album art placeholder */}
      <div className="w-48 h-48 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <span className="text-7xl">🎵</span>
      </div>

      {/* Title */}
      <div className="text-white text-base font-medium text-center truncate max-w-full px-4">
        {filename}
      </div>

      {/* Progress bar */}
      <div className="w-full px-4">
        <div
          className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer relative group"
          onClick={handleSeek}
          onTouchStart={handleTouchSeek}
          onTouchMove={handleTouchSeek}
        >
          <div
            className="h-full bg-white/60 rounded-full transition-all relative"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between text-white/40 text-xs font-mono mt-1.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={cycleSpeed}
          className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white/70 text-xs cursor-pointer font-mono min-w-[44px]"
        >
          {speed}x
        </button>
        <button
          onClick={togglePlay}
          className="w-14 h-14 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer transition-colors"
        >
          {playing ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21" />
            </svg>
          )}
        </button>
        <div className="min-w-[44px]" /> {/* spacer */}
      </div>
    </div>
  );
}

