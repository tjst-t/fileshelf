const TEXT_EXTS = new Set([
  "txt", "md", "log", "json", "xml", "yaml", "yml", "toml", "ini", "conf",
  "sh", "bash", "py", "go", "js", "ts", "tsx", "jsx", "css", "html", "htm",
  "sql", "csv", "rs", "c", "cpp", "h", "hpp", "java", "rb", "php", "swift",
  "kt", "scala", "lua", "r", "pl", "makefile", "dockerfile", "gitignore",
  "env", "cfg", "properties", "gradle", "cmake", "vue", "svelte",
]);

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"]);

export function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function fileType(name: string): "image" | "video" | "audio" | "pdf" | "text" | "unknown" {
  const ext = getExt(name);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (TEXT_EXTS.has(ext)) return "text";
  return "unknown";
}

export function isPreviewable(name: string): boolean {
  return fileType(name) !== "unknown";
}
