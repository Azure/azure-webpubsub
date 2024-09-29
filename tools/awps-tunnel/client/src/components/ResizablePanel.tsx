import React, { useState, useRef, useCallback } from "react";

export interface ResizablePanelProps {
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
  initialLeftWidth?: string; // Supports both percentage and pixel-based width
}

export function ResizablePanel({
  left,
  right,
  className,
  initialLeftWidth = "30%",
}: ResizablePanelProps) {
  const [leftWidth, setLeftWidth] = useState<string>(initialLeftWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const splitterRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef<boolean>(false);

  // Handle mouse move event to update width
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing.current && containerRef.current) {
      const newWidth = Math.max(50, e.pageX - containerRef.current.getBoundingClientRect().left);
      setLeftWidth(`${newWidth}px`);
    }
  }, []);

  // Handle mouse up event to stop resizing
  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "auto"; // Re-enable text selection
  }, [handleMouseMove]);
  
  // Handle mouse down event to start resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none"; // Disable text selection
  }, [handleMouseMove, handleMouseUp]);


  return (
    <div
      ref={containerRef}
      className={`resizablePanel d-flex ${className || ""}`}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    >
      {/* Left Panel */}
      <div
        className="d-flex flex-column"
        style={{ flex: `0 0 ${leftWidth}`, overflow: "auto" }}
      >
        {left}
      </div>

      {/* Splitter */}
      <div
        ref={splitterRef}
        onMouseDown={handleMouseDown}
        className="d-flex flex-column"
        style={{
          width: "3px",
          background: "linear-gradient(to right, #ccc, #eee, #ccc)",
          cursor: "col-resize",
          flexShrink: 0, // Prevent shrinking
        }}
      ></div>

      {/* Right Panel */}
      <div
        className="d-flex flex-column flex-fill"
        style={{ overflow: "auto" }}
      >
        {right}
      </div>
    </div>
  );
}
