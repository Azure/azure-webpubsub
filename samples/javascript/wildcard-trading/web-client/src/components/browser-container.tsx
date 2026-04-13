import React from "react";

interface Props {
  children: React.ReactNode;
  wide?: boolean;
}

export default function BrowserContainer({ children, wide }: Props) {
  return (
    <div
      className={`flex flex-col border border-gray-300 rounded-lg  overflow-hidden bg-white ${
        wide ? "w-1/2" : ""
      }`}
    >
      {/* Browser header */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-100 border-b border-gray-300">
        <div className="flex gap-2">
          <div className="size-2 rounded-full bg-red-500"></div>
          <div className="size-2 rounded-full bg-yellow-500"></div>
          <div className="size-2 rounded-full bg-green-500"></div>
        </div>
      </div>
      {/* Browser content */}
      <div className="flex-1 overflow-auto p-2">{children}</div>
    </div>
  );
}
