import React from "react";

interface Props {
  children: React.ReactNode;
  header: string | React.ReactNode;
}

export default function AccountContainer({ header, children }: Props) {
  return (
    <div className="border border-amber-200 bg-amber-50 h-full flex flex-col rounded-xl overflow-hidden w-full">
      <h2 className="text-sm font-semibold text-amber-900 bg-amber-200 py-2 pl-3 uppercase tracking-wide">
        {header}
      </h2>
      <div className="flex gap-4 p-3 flex-1 justify-center">{children}</div>
    </div>
  );
}
