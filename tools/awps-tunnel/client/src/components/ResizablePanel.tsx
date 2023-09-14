import React, { useState } from 'react';

export interface ResizablePanelProps {
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}

export function ResizablePanel({ left, right, className } : ResizablePanelProps) {
  const [leftWidth, setLeftWidth] = useState("30%");

  const handleResize = (e: MouseEvent) => {
    setLeftWidth(`${e.pageX}px`);
  };

  return (
    <div className={`resizablePanel d-flex ${className || ''} overflow-auto`}>
      <div className="d-flex flex-column overflow-auto" style={{ flex: `0 0 ${leftWidth}`, resize: "horizontal" }}>
        <div className="overflow-auto flex-fill">{left}</div>
      </div>
      <div
        style={{
          flex: `0 0 3px`,
          backgroundColor: "#ccc",
          cursor: "col-resize",
        }}
        onMouseDown={(e) => {
          document.addEventListener("mousemove", handleResize);
          document.addEventListener("mouseup", () => {
            document.removeEventListener("mousemove", handleResize);
          });
        }}
      ></div>
      <div className="d-flex flex-column overflow-auto flex-fill">
        <div className="overflow-auto flex-fill">{right}</div>
      </div>
    </div>
  );
}
