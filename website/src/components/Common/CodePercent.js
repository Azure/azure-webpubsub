import React from "react";

import { LANGUAGE_COLORS } from "./LanguageColors";

function CodePercent({ lang, percent }) {
  // Language color scheme follows that on GitHub.
  let languageColor = LANGUAGE_COLORS.find(
    (item) => item.language === lang
  ).color;

  return (
    <div className="flex items-center gap-1">
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: languageColor }}
      ></div>
      <p className="leading-3">
        <span className="text-xs font-bold">{lang}</span>{" "}
        <span className="text-xs">{percent}%</span>
      </p>
    </div>
  );
}

export default CodePercent;
