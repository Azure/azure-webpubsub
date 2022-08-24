import React from "react";

function ButtonLink({ text, to, children, openInNewTab = true }) {
  return (
    <button className="flex items-center rounded-sm bg-blue-600 px-5 py-2 text-sm text-gray-100 hover:bg-blue-700">
      {children && <div className="w-5">{children}</div>}
      <a
        href={to}
        target={openInNewTab ? "_blank" : ""}
        className="pl-2 font-semibold"
      >
        {text}
      </a>
    </button>
  );
}

export default ButtonLink;
