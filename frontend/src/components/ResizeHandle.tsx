import { useCallback, useEffect, useRef, useState } from "react";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
}

export default function ResizeHandle({ onResize }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, onResize]);

  return (
    <div
      className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors ${
        dragging ? "bg-accent/40" : "bg-transparent"
      }`}
      onMouseDown={handleMouseDown}
    />
  );
}
