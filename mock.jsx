import { useState, useMemo, useCallback, useEffect } from "react";

const MOCK_SHARES = {
  media: {
    name: "media", path: "/tank/media",
    children: {
      movies: { name: "movies", type: "dir", children: {
        "inception.mkv": { name: "inception.mkv", type: "file", size: 4294967296, modified: "2024-12-01T10:30:00Z", perms: "rw-r-----" },
        "interstellar.mkv": { name: "interstellar.mkv", type: "file", size: 5368709120, modified: "2024-11-15T08:00:00Z", perms: "rw-r-----" },
        "blade_runner_2049.mkv": { name: "blade_runner_2049.mkv", type: "file", size: 3758096384, modified: "2025-01-20T14:22:00Z", perms: "rw-r-----" },
      }},
      music: { name: "music", type: "dir", children: {
        jazz: { name: "jazz", type: "dir", children: {
          "miles_davis_so_what.flac": { name: "miles_davis_so_what.flac", type: "file", size: 52428800, modified: "2024-10-05T09:00:00Z", perms: "rw-rw-r--" },
          "coltrane_blue_train.flac": { name: "coltrane_blue_train.flac", type: "file", size: 48234496, modified: "2024-10-05T09:10:00Z", perms: "rw-rw-r--" },
        }},
        rock: { name: "rock", type: "dir", children: {
          "led_zeppelin_iv.flac": { name: "led_zeppelin_iv.flac", type: "file", size: 67108864, modified: "2024-09-12T16:45:00Z", perms: "rw-rw-r--" },
        }},
      }},
      photos: { name: "photos", type: "dir", children: {
        "vacation_2024.jpg": { name: "vacation_2024.jpg", type: "file", size: 8388608, modified: "2024-08-20T12:00:00Z", perms: "rw-r--r--" },
        "family_portrait.png": { name: "family_portrait.png", type: "file", size: 15728640, modified: "2025-02-14T18:30:00Z", perms: "rw-------" },
        "screenshot_2025.webp": { name: "screenshot_2025.webp", type: "file", size: 1048576, modified: "2025-03-01T10:00:00Z", perms: "rw-r--r--" },
      }},
    },
  },
  documents: {
    name: "documents", path: "/tank/documents",
    children: {
      work: { name: "work", type: "dir", children: {
        "report_q4.pdf": { name: "report_q4.pdf", type: "file", size: 2097152, modified: "2025-01-31T17:00:00Z", perms: "rw-r-----" },
        "budget_2025.xlsx": { name: "budget_2025.xlsx", type: "file", size: 524288, modified: "2025-02-01T09:00:00Z", perms: "rw-------" },
        "meeting_notes.md": { name: "meeting_notes.md", type: "file", size: 4096, modified: "2025-03-01T11:30:00Z", perms: "rw-rw-r--" },
        "architecture.svg": { name: "architecture.svg", type: "file", size: 32768, modified: "2025-02-20T15:00:00Z", perms: "rw-r--r--" },
        "readme.txt": { name: "readme.txt", type: "file", size: 1200, modified: "2025-01-10T08:00:00Z", perms: "rw-rw-r--" },
      }},
      personal: { name: "personal", type: "dir", children: {
        "tax_2024.pdf": { name: "tax_2024.pdf", type: "file", size: 1048576, modified: "2025-02-28T20:00:00Z", perms: "rw-------" },
        "notes.md": { name: "notes.md", type: "file", size: 2048, modified: "2025-03-05T14:00:00Z", perms: "rw-------" },
      }},
    },
  },
  backups: {
    name: "backups", path: "/tank/backups",
    children: {
      "proxmox_dump_20250301.zst": { name: "proxmox_dump_20250301.zst", type: "file", size: 10737418240, modified: "2025-03-01T03:00:00Z", perms: "rw-------" },
      "homelab_config.tar.gz": { name: "homelab_config.tar.gz", type: "file", size: 134217728, modified: "2025-02-15T04:00:00Z", perms: "rw-r-----" },
    },
  },
};

const MOCK_USER = "tjstkm";

const MOCK_PREVIEWS = {
  "meeting_notes.md": "# Meeting Notes - 2025-03-01\n\n## Agenda\n- Infrastructure migration timeline\n- Budget review for Q2\n- New storage array procurement\n\n## Action Items\n- [ ] Finalize vendor selection by March 15\n- [ ] Update capacity planning spreadsheet\n- [x] Submit PO for NVMe drives",
  "readme.txt": "fileshelf - NAS File Explorer\n\nA web-based file browser for Linux NAS systems.\nIntegrates with Authelia for authentication\nand uses POSIX ACL for access control.\n\nSee https://github.com/tjst-t/fileshelf",
  "notes.md": "# Personal Notes\n\n## TODO\n- Upgrade Aruba AP to UniFi U7 Lite\n- Fix Tailscale subnet routing\n- Write Zenn article about BIND migration\n\n## Ideas\n- Side business: VMware migration consulting\n- Containerlab NOC dashboard improvements",
};

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function formatDateLong(iso) {
  return new Date(iso).toLocaleString("ja-JP", { year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit" });
}

function getFileIcon(name, type) {
  if (type === "dir") return "📁";
  const ext = name.split(".").pop().toLowerCase();
  const m = { mkv:"🎬",mp4:"🎬",avi:"🎬",flac:"🎵",mp3:"🎵",wav:"🎵",jpg:"🖼",jpeg:"🖼",png:"🖼",gif:"🖼",webp:"🖼",svg:"🖼",pdf:"📄",doc:"📝",docx:"📝",xlsx:"📊",xls:"📊",csv:"📊",md:"📑",txt:"📑",tar:"📦",gz:"📦",zst:"📦",zip:"📦","7z":"📦" };
  return m[ext] || "📄";
}

function getPreviewType(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "image";
  if (["mp4","webm"].includes(ext)) return "video";
  if (["mp3","flac","wav","ogg"].includes(ext)) return "audio";
  if (["md","txt","log","json","yaml","yml","toml","conf","sh","py","go","rs","js","jsx","ts","tsx","css","html"].includes(ext)) return "text";
  if (["pdf"].includes(ext)) return "pdf";
  if (["mkv","avi","mov"].includes(ext)) return "video-unsupported";
  return "none";
}

function getNodeAtPath(path) {
  if (!path || path.length === 0) return null;
  const [shareName, ...rest] = path;
  let node = MOCK_SHARES[shareName];
  if (!node) return null;
  for (const seg of rest) {
    if (!node.children || !node.children[seg]) return null;
    node = node.children[seg];
  }
  return node;
}

function TreeNode({ name, node, path, depth, selectedPath, onSelect }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = node.children !== undefined;
  const currentPath = [...path, name];
  const isSelected = selectedPath && selectedPath.join("/") === currentPath.join("/");
  if (!isDir) return null;
  const childDirs = Object.entries(node.children || {}).filter(([,v]) => v.children !== undefined);

  return (
    <div>
      <div onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); onSelect(currentPath); }}
        style={{
          paddingLeft: depth*16+8, paddingTop:4, paddingBottom:4, paddingRight:8,
          cursor:"pointer", display:"flex", alignItems:"center", gap:6,
          fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif",
          background: isSelected ? "rgba(86,156,214,0.18)" : "transparent",
          borderRight: isSelected ? "2px solid #569cd6" : "2px solid transparent",
          color: isSelected ? "#e2e8f0" : "#94a3b8",
          transition:"all 0.15s ease", userSelect:"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
        }}
        onMouseEnter={(e) => { if(!isSelected) e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}
        onMouseLeave={(e) => { if(!isSelected) e.currentTarget.style.background="transparent"; }}
      >
        <span style={{ fontSize:10,color:"#64748b",width:14,textAlign:"center",transition:"transform 0.15s ease",transform:expanded?"rotate(90deg)":"rotate(0deg)",display:"inline-block" }}>
          {childDirs.length > 0 ? "▶" : " "}
        </span>
        <span style={{fontSize:14}}>{expanded ? "📂" : "📁"}</span>
        <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{name}</span>
      </div>
      {expanded && childDirs.sort(([a],[b])=>a.localeCompare(b)).map(([cn,cv])=>(
        <TreeNode key={cn} name={cn} node={cv} path={currentPath} depth={depth+1} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  );
}

function ContextMenu({ x, y, items, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:999}} />
      <div style={{
        position:"fixed",left:x,top:y,zIndex:1000,background:"#1e2433",border:"1px solid #2d3548",
        borderRadius:6,padding:"4px 0",minWidth:210,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
        fontFamily:"'IBM Plex Sans',sans-serif",fontSize:13,
      }}>
        {items.map((item,i) => item.divider ? (
          <div key={i} style={{height:1,background:"#2d3548",margin:"4px 0"}} />
        ) : (
          <div key={i} onClick={()=>{if(!item.disabled){item.action();onClose();}}}
            style={{
              padding:"7px 14px",cursor:item.disabled?"default":"pointer",
              color:item.disabled?"#475569":item.danger?"#f87171":"#cbd5e1",
              display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
              opacity:item.disabled?0.5:1,
            }}
            onMouseEnter={(e)=>{if(!item.disabled)e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";}}
          >
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{width:18,textAlign:"center",fontSize:14}}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
            {item.shortcut && <span style={{fontSize:11,color:"#475569",fontFamily:"'IBM Plex Mono',monospace"}}>{item.shortcut}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function Breadcrumb({ path, onNavigate }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:2,fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:"#64748b",padding:"0 4px",overflow:"hidden"}}>
      <span onClick={()=>onNavigate([])} style={{cursor:"pointer",color:"#569cd6",padding:"2px 4px",borderRadius:3}}
        onMouseEnter={(e)=>(e.currentTarget.style.background="rgba(86,156,214,0.12)")}
        onMouseLeave={(e)=>(e.currentTarget.style.background="transparent")}>/</span>
      {path.map((seg,i)=>(
        <span key={i} style={{display:"flex",alignItems:"center"}}>
          <span style={{color:"#334155",margin:"0 2px"}}>/</span>
          <span onClick={()=>onNavigate(path.slice(0,i+1))}
            style={{cursor:"pointer",color:i===path.length-1?"#e2e8f0":"#569cd6",padding:"2px 4px",borderRadius:3}}
            onMouseEnter={(e)=>(e.currentTarget.style.background="rgba(86,156,214,0.12)")}
            onMouseLeave={(e)=>(e.currentTarget.style.background="transparent")}>{seg}</span>
        </span>
      ))}
    </div>
  );
}

function PreviewPanel({ entry, fullPath, onClose }) {
  if (!entry) return (
    <div style={{width:320,minWidth:280,background:"#131720",borderLeft:"1px solid #1e2433",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#334155",fontSize:13,flexShrink:0}}>
      <span style={{fontSize:32,marginBottom:8}}>👁</span>
      Select a file to preview
    </div>
  );

  const previewType = getPreviewType(entry.name);
  const textContent = MOCK_PREVIEWS[entry.name];
  const pathStr = "/" + fullPath.join("/");

  const previewArea = {
    image: (
      <div style={{background:"#1e2433",borderRadius:6,padding:12,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",minHeight:140}}>
        <div style={{width:"100%",height:120,borderRadius:4,background:"linear-gradient(135deg,#2d3548 0%,#1e2433 50%,#2d3548 100%)",display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontSize:13}}>
          🖼 Image preview
        </div>
      </div>
    ),
    video: (
      <div style={{background:"#1e2433",borderRadius:6,padding:12,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",minHeight:140}}>
        <div style={{width:"100%",height:120,borderRadius:4,background:"linear-gradient(135deg,#1a1f2e,#0f1219)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,color:"#475569"}}>
          <span style={{fontSize:32}}>▶</span><span style={{fontSize:12}}>Video preview</span>
        </div>
      </div>
    ),
    "video-unsupported": (
      <div style={{background:"#1e2433",borderRadius:6,padding:16,marginBottom:16,textAlign:"center",color:"#475569",fontSize:12}}>
        <span style={{fontSize:28,display:"block",marginBottom:8}}>🎬</span>
        Browser preview not available for .{entry.name.split(".").pop()} files.<br/>Use download to play locally.
      </div>
    ),
    audio: (
      <div style={{background:"#1e2433",borderRadius:6,padding:16,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
        <span style={{fontSize:28}}>🎵</span>
        <div style={{width:"100%",height:4,background:"#2d3548",borderRadius:2,position:"relative"}}>
          <div style={{width:"35%",height:"100%",background:"#569cd6",borderRadius:2}} />
        </div>
        <div style={{display:"flex",gap:16,marginTop:4}}>
          {["⏮","▶","⏭"].map((btn,i)=>(
            <button key={i} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:16,padding:4}}>{btn}</button>
          ))}
        </div>
      </div>
    ),
    text: textContent ? (
      <div style={{background:"#1e2433",borderRadius:6,padding:12,marginBottom:16,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,lineHeight:1.6,color:"#94a3b8",whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:200,overflow:"auto"}}>
        {textContent}
      </div>
    ) : (
      <div style={{background:"#1e2433",borderRadius:6,padding:16,marginBottom:16,textAlign:"center",color:"#475569",fontSize:12}}>
        Text preview available (API not connected)
      </div>
    ),
    pdf: (
      <div style={{background:"#1e2433",borderRadius:6,padding:16,marginBottom:16,textAlign:"center",color:"#475569",fontSize:12}}>
        <span style={{fontSize:28,display:"block",marginBottom:8}}>📄</span>PDF preview will open in browser viewer
      </div>
    ),
    none: (
      <div style={{background:"#1e2433",borderRadius:6,padding:16,marginBottom:16,textAlign:"center",color:"#475569",fontSize:12}}>
        No preview available for this file type
      </div>
    ),
  };

  return (
    <div style={{width:320,minWidth:280,background:"#131720",borderLeft:"1px solid #1e2433",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
      <div style={{padding:"12px 14px",borderBottom:"1px solid #1e2433",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:12,fontWeight:600,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.05em"}}>Preview</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:16,padding:"0 4px",lineHeight:1}}>×</button>
      </div>
      <div style={{flex:1,overflow:"auto",padding:14}}>
        <div style={{textAlign:"center",padding:"16px 0 20px"}}>
          <div style={{fontSize:48,marginBottom:8}}>{getFileIcon(entry.name, entry.type)}</div>
          <div style={{fontSize:14,fontWeight:500,color:"#e2e8f0",wordBreak:"break-all",lineHeight:1.4}}>{entry.name}</div>
        </div>
        {previewArea[previewType] || previewArea.none}
        <div style={{fontSize:12,color:"#64748b"}}>
          {[["Path",pathStr],["Size",formatSize(entry.size)],["Modified",entry.modified?formatDateLong(entry.modified):"—"],["Permissions",entry.perms],["Type",entry.name.split(".").pop().toUpperCase()]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(30,36,51,0.6)"}}>
              <span style={{color:"#475569"}}>{l}</span>
              <span style={{color:"#94a3b8",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,textAlign:"right",maxWidth:"60%",wordBreak:"break-all"}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:6}}>
          <button style={{background:"rgba(86,156,214,0.15)",border:"1px solid rgba(86,156,214,0.3)",borderRadius:5,color:"#569cd6",cursor:"pointer",padding:"8px 0",fontSize:12,fontFamily:"'IBM Plex Sans',sans-serif",width:"100%"}}>⬇ Download</button>
          <button style={{background:"none",border:"1px solid #2d3548",borderRadius:5,color:"#94a3b8",cursor:"pointer",padding:"8px 0",fontSize:12,fontFamily:"'IBM Plex Sans',sans-serif",width:"100%"}}>📋 Copy path</button>
        </div>
      </div>
    </div>
  );
}

function ClipboardBar({ clipboard, onPaste, onCancel }) {
  if (!clipboard) return null;
  const isCut = clipboard.op === "cut";
  return (
    <div style={{
      height:36, background:isCut?"rgba(251,146,60,0.08)":"rgba(86,156,214,0.08)",
      borderBottom:`1px solid ${isCut?"rgba(251,146,60,0.2)":"rgba(86,156,214,0.2)"}`,
      display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"0 14px",fontSize:12,fontFamily:"'IBM Plex Sans',sans-serif",flexShrink:0,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:isCut?"#fb923c":"#569cd6"}}>{isCut?"✂ Cut":"📋 Copied"}:</span>
        <span style={{color:"#94a3b8",fontFamily:"'IBM Plex Mono',monospace",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {clipboard.entries.map(e=>e.name).join(", ")}
        </span>
        <span style={{color:"#475569"}}>({clipboard.entries.length} item{clipboard.entries.length>1?"s":""})</span>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={onPaste} style={{background:"rgba(86,156,214,0.15)",border:"1px solid rgba(86,156,214,0.3)",borderRadius:4,color:"#569cd6",cursor:"pointer",padding:"2px 12px",fontSize:12,fontFamily:"'IBM Plex Sans',sans-serif"}}>Paste here</button>
        <button onClick={onCancel} style={{background:"none",border:"1px solid #2d3548",borderRadius:4,color:"#64748b",cursor:"pointer",padding:"2px 8px",fontSize:12}}>×</button>
      </div>
    </div>
  );
}

export default function FileShelf() {
  const [selectedPath, setSelectedPath] = useState(["media"]);
  const [sortKey, setSortKey] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [notification, setNotification] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [previewEntry, setPreviewEntry] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  }, []);

  const currentNode = useMemo(() => {
    if (!selectedPath || selectedPath.length === 0) return null;
    return getNodeAtPath(selectedPath);
  }, [selectedPath]);

  const entries = useMemo(() => {
    if (!currentNode || !currentNode.children) return [];
    return Object.entries(currentNode.children).map(([name, node]) => ({
      name, type: node.children !== undefined ? "dir" : "file",
      size: node.size || 0, modified: node.modified || "", perms: node.perms || "rwxr-xr-x",
    }));
  }, [currentNode]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "size") cmp = a.size - b.size;
      else if (sortKey === "modified") cmp = a.modified.localeCompare(b.modified);
      else if (sortKey === "perms") cmp = a.perms.localeCompare(b.perms);
      return sortAsc ? cmp : -cmp;
    });
  }, [entries, sortKey, sortAsc]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    const action = clipboard.op === "cut" ? "Moved" : "Copied";
    const src = "/" + clipboard.sourcePath.join("/");
    const dst = "/" + selectedPath.join("/");
    showNotification(`${action} ${clipboard.entries.length} item(s): ${src} → ${dst}`);
    if (clipboard.op === "cut") setClipboard(null);
  }, [clipboard, selectedPath, showNotification]);

  const doCopy = useCallback(() => {
    const ents = entries.filter(en => selectedFiles.has(en.name));
    if (ents.length === 0) return;
    setClipboard({ op: "copy", entries: ents, sourcePath: [...selectedPath] });
    showNotification(`Copied ${ents.length} item(s)`);
  }, [entries, selectedFiles, selectedPath, showNotification]);

  const doCut = useCallback(() => {
    const ents = entries.filter(en => selectedFiles.has(en.name));
    if (ents.length === 0) return;
    setClipboard({ op: "cut", entries: ents, sourcePath: [...selectedPath] });
    showNotification(`Cut ${ents.length} item(s)`);
  }, [entries, selectedFiles, selectedPath, showNotification]);

  useEffect(() => {
    const handler = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "c" && selectedFiles.size > 0) { e.preventDefault(); doCopy(); }
      if (meta && e.key === "x" && selectedFiles.size > 0) { e.preventDefault(); doCut(); }
      if (meta && e.key === "v" && clipboard) { e.preventDefault(); handlePaste(); }
      if (e.key === " " && selectedFiles.size === 1) {
        e.preventDefault();
        const entry = entries.find(en => selectedFiles.has(en.name));
        if (entry && entry.type === "file") { setPreviewEntry(entry); setShowPreview(true); }
      }
      if (e.key === "Escape") {
        if (showPreview) setShowPreview(false);
        else if (contextMenu) setContextMenu(null);
        else if (clipboard) setClipboard(null);
        else setSelectedFiles(new Set());
      }
      if (meta && e.key === "a") { e.preventDefault(); setSelectedFiles(new Set(entries.map(en => en.name))); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFiles, entries, clipboard, selectedPath, showPreview, contextMenu, doCopy, doCut, handlePaste]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const handleFileClick = (entry, e) => {
    if (e.shiftKey && selectedFiles.size > 0) {
      const names = sortedEntries.map(en => en.name);
      const last = [...selectedFiles].pop();
      const from = names.indexOf(last);
      const to = names.indexOf(entry.name);
      const [s, end] = from < to ? [from, to] : [to, from];
      setSelectedFiles(new Set([...selectedFiles, ...names.slice(s, end + 1)]));
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectedFiles);
      next.has(entry.name) ? next.delete(entry.name) : next.add(entry.name);
      setSelectedFiles(next);
    } else {
      setSelectedFiles(new Set([entry.name]));
    }
    if (entry.type === "file") setPreviewEntry(entry);
  };

  const handleContextMenu = (e, entry) => {
    e.preventDefault();
    if (!selectedFiles.has(entry.name)) setSelectedFiles(new Set([entry.name]));
    const sel = selectedFiles.has(entry.name) ? selectedFiles : new Set([entry.name]);
    const multi = sel.size > 1;

    const copyItem = { icon:"📋", label:"Copy", shortcut:"⌘C", action: doCopy };
    const cutItem = { icon:"✂️", label:"Cut", shortcut:"⌘X", action: doCut };
    const pasteItem = clipboard
      ? { icon:"📋", label:"Paste here", shortcut:"⌘V", action: handlePaste }
      : { icon:"📋", label:"Paste here", shortcut:"⌘V", action:()=>{}, disabled:true };

    const items = entry.type === "dir" && !multi ? [
      { icon:"📂", label:"Open", action:()=>{setSelectedPath([...selectedPath,entry.name]);setSelectedFiles(new Set());} },
      { divider:true },
      copyItem, cutItem, pasteItem,
      { divider:true },
      { icon:"✏️", label:"Rename", action:()=>showNotification(`Rename: ${entry.name}`) },
      { icon:"🗑", label:"Delete", danger:true, action:()=>showNotification(`Delete: ${entry.name}`) },
    ] : [
      ...(!multi?[{ icon:"👁", label:"Preview", shortcut:"Space", action:()=>{setPreviewEntry(entry);setShowPreview(true);} }]:[]),
      ...(!multi?[{ icon:"⬇️", label:"Download", action:()=>showNotification(`Download: ${entry.name}`) }]:[]),
      ...(multi?[{ icon:"⬇️", label:`Download ${sel.size} items`, action:()=>showNotification(`Download ${sel.size} items as zip`) }]:[]),
      { divider:true },
      copyItem, cutItem, pasteItem,
      { divider:true },
      ...(!multi?[{ icon:"✏️", label:"Rename", action:()=>showNotification(`Rename: ${entry.name}`) }]:[]),
      ...(!multi?[{ icon:"📋", label:"Copy path", action:()=>showNotification("Path copied") }]:[]),
      { icon:"🗑", label:`Delete${multi?` ${sel.size} items`:""}`, danger:true, action:()=>showNotification(`Delete: ${multi?`${sel.size} items`:entry.name}`) },
    ];
    setContextMenu({ x:e.clientX, y:e.clientY, items });
  };

  const handleDoubleClick = (entry) => {
    if (entry.type === "dir") { setSelectedPath([...selectedPath,entry.name]); setSelectedFiles(new Set()); setPreviewEntry(null); }
    else { setPreviewEntry(entry); setShowPreview(true); }
  };

  const sortInd = (key) => sortKey !== key ? "" : sortAsc ? " ↑" : " ↓";
  const hdrStyle = (key) => ({
    cursor:"pointer",padding:"8px 12px",color:sortKey===key?"#e2e8f0":"#64748b",
    fontWeight:sortKey===key?600:400,fontSize:11,textTransform:"uppercase",letterSpacing:"0.05em",
    userSelect:"none",whiteSpace:"nowrap",borderBottom:"1px solid #1e2433",
    background:sortKey===key?"rgba(86,156,214,0.06)":"transparent",
  });

  const navigate = (p) => { setSelectedPath(p); setSelectedFiles(new Set()); setPreviewEntry(null); };

  return (
    <div style={{width:"100%",height:"100vh",background:"#0f1219",color:"#e2e8f0",fontFamily:"'IBM Plex Sans',sans-serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Title bar */}
      <div style={{height:48,background:"#151a24",borderBottom:"1px solid #1e2433",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>📚</span>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:600,fontSize:15,color:"#e2e8f0",letterSpacing:"-0.02em"}}>fileshelf</span>
          <span style={{fontSize:11,color:"#475569",fontFamily:"'IBM Plex Mono',monospace",marginLeft:4}}>v0.1.0-proto</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,color:"#64748b",fontFamily:"'IBM Plex Mono',monospace"}}>{MOCK_USER}</span>
          <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#569cd6,#4ec9b0)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:"#0f1219"}}>T</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{height:40,background:"#151a24",borderBottom:"1px solid #1e2433",display:"flex",alignItems:"center",padding:"0 12px",gap:8,flexShrink:0}}>
        <button onClick={()=>{if(selectedPath.length>0)navigate(selectedPath.slice(0,-1));}} disabled={selectedPath.length===0}
          style={{background:"none",border:"1px solid #2d3548",borderRadius:4,color:selectedPath.length===0?"#334155":"#94a3b8",cursor:selectedPath.length===0?"default":"pointer",padding:"3px 10px",fontSize:14,display:"flex",alignItems:"center"}}>←</button>
        <div style={{flex:1}}><Breadcrumb path={selectedPath} onNavigate={navigate} /></div>
        <button onClick={()=>showNotification("New folder dialog (mock)")} style={{background:"none",border:"1px solid #2d3548",borderRadius:4,color:"#94a3b8",cursor:"pointer",padding:"3px 10px",fontSize:12,fontFamily:"'IBM Plex Sans',sans-serif"}}>+ New folder</button>
        <button onClick={()=>showNotification("Upload dialog (mock)")} style={{background:"rgba(86,156,214,0.15)",border:"1px solid rgba(86,156,214,0.3)",borderRadius:4,color:"#569cd6",cursor:"pointer",padding:"3px 10px",fontSize:12,fontFamily:"'IBM Plex Sans',sans-serif"}}>⬆ Upload</button>
        <div style={{width:1,height:20,background:"#2d3548"}} />
        <button onClick={()=>setShowPreview(!showPreview)}
          style={{background:showPreview?"rgba(86,156,214,0.12)":"none",border:`1px solid ${showPreview?"rgba(86,156,214,0.3)":"#2d3548"}`,borderRadius:4,color:showPreview?"#569cd6":"#64748b",cursor:"pointer",padding:"3px 10px",fontSize:12,fontFamily:"'IBM Plex Sans',sans-serif"}}>☰ Preview</button>
      </div>

      <ClipboardBar clipboard={clipboard} onPaste={handlePaste} onCancel={()=>setClipboard(null)} />

      {/* Main */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Tree */}
        <div style={{width:240,minWidth:180,background:"#131720",borderRight:"1px solid #1e2433",overflowY:"auto",overflowX:"hidden",padding:"8px 0",flexShrink:0}}>
          <div style={{padding:"4px 12px 8px",fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"#475569",fontWeight:600}}>Shares</div>
          {Object.entries(MOCK_SHARES).sort(([a],[b])=>a.localeCompare(b)).map(([name,node])=>(
            <TreeNode key={name} name={name} node={node} path={[]} depth={0} selectedPath={selectedPath} onSelect={navigate} />
          ))}
        </div>

        {/* File list */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}
          onDragOver={(e)=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={(e)=>{e.preventDefault();setDragOver(false);showNotification(`Upload ${e.dataTransfer.files.length} file(s) (mock)`);}}
          onClick={(e)=>{if(e.target===e.currentTarget)setSelectedFiles(new Set());}}
        >
          {dragOver && (
            <div style={{position:"absolute",inset:0,background:"rgba(86,156,214,0.08)",border:"2px dashed #569cd6",borderRadius:8,zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#569cd6",fontWeight:500,margin:8}}>Drop files to upload</div>
          )}
          {selectedPath.length === 0 ? (
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#334155",gap:8}}>
              <span style={{fontSize:36}}>📚</span><span style={{fontSize:14}}>Select a share from the tree</span>
            </div>
          ) : (
            <div style={{flex:1,overflow:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
                <thead style={{position:"sticky",top:0,background:"#151a24",zIndex:2}}>
                  <tr>
                    <th style={{...hdrStyle("name"),textAlign:"left",width:"45%"}} onClick={()=>handleSort("name")}>Name{sortInd("name")}</th>
                    <th style={{...hdrStyle("size"),textAlign:"right",width:"15%"}} onClick={()=>handleSort("size")}>Size{sortInd("size")}</th>
                    <th style={{...hdrStyle("modified"),textAlign:"left",width:"22%"}} onClick={()=>handleSort("modified")}>Modified{sortInd("modified")}</th>
                    <th style={{...hdrStyle("perms"),textAlign:"left",width:"18%"}} onClick={()=>handleSort("perms")}>Perms{sortInd("perms")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.length === 0 ? (
                    <tr><td colSpan={4} style={{padding:40,textAlign:"center",color:"#334155",fontSize:14}}>Empty directory</td></tr>
                  ) : sortedEntries.map((entry) => {
                    const isCut = clipboard?.op==="cut" && clipboard.sourcePath.join("/")=== selectedPath.join("/") && clipboard.entries.some(e=>e.name===entry.name);
                    return (
                      <tr key={entry.name} onClick={(e)=>handleFileClick(entry,e)} onDoubleClick={()=>handleDoubleClick(entry)} onContextMenu={(e)=>handleContextMenu(e,entry)}
                        style={{cursor:"pointer",background:selectedFiles.has(entry.name)?"rgba(86,156,214,0.12)":"transparent",borderBottom:"1px solid rgba(30,36,51,0.5)",transition:"background 0.1s ease",opacity:isCut?0.4:1}}
                        onMouseEnter={(e)=>{if(!selectedFiles.has(entry.name))e.currentTarget.style.background="rgba(255,255,255,0.02)";}}
                        onMouseLeave={(e)=>{if(!selectedFiles.has(entry.name))e.currentTarget.style.background="transparent";}}
                      >
                        <td style={{padding:"6px 12px",fontSize:13,display:"flex",alignItems:"center",gap:8,overflow:"hidden"}}>
                          <span style={{fontSize:15,flexShrink:0}}>{getFileIcon(entry.name,entry.type)}</span>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:entry.type==="dir"?"#569cd6":"#e2e8f0"}}>{entry.name}</span>
                        </td>
                        <td style={{padding:"6px 12px",fontSize:12,textAlign:"right",color:"#64748b",fontFamily:"'IBM Plex Mono',monospace"}}>{entry.type==="dir"?"—":formatSize(entry.size)}</td>
                        <td style={{padding:"6px 12px",fontSize:12,color:"#64748b",fontFamily:"'IBM Plex Mono',monospace"}}>{entry.modified?formatDate(entry.modified):"—"}</td>
                        <td style={{padding:"6px 12px",fontSize:12,color:"#4e5a6e",fontFamily:"'IBM Plex Mono',monospace"}}>{entry.perms}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{height:28,background:"#131720",borderTop:"1px solid #1e2433",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px",fontSize:11,color:"#475569",fontFamily:"'IBM Plex Mono',monospace",flexShrink:0}}>
            <span>{selectedFiles.size>0?`${selectedFiles.size} selected`:`${entries.length} items (${entries.filter(e=>e.type==="dir").length} dirs, ${entries.filter(e=>e.type==="file").length} files)`}</span>
            <span>{formatSize((selectedFiles.size>0?entries.filter(e=>selectedFiles.has(e.name)):entries).reduce((s,e)=>s+(e.size||0),0))}</span>
          </div>
        </div>

        {/* Preview */}
        {showPreview && <PreviewPanel entry={previewEntry} fullPath={previewEntry?[...selectedPath,previewEntry.name]:[]} onClose={()=>setShowPreview(false)} />}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={()=>setContextMenu(null)} />}
      {notification && <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#1e2433",border:"1px solid #2d3548",borderRadius:6,padding:"8px 16px",fontSize:13,color:"#e2e8f0",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",zIndex:2000}}>{notification}</div>}
    </div>
  );
}