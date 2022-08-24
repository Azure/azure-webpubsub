import React from "react";

import ChevronLeft from "@site/static/icons/chevron_left.svg";
import ChevronRight from "@site/static/icons/chevron_right.svg";

function ButtonNav({ direction, onClick, isShow }) {
  return (
    <div
      className={`${
        isShow
          ? "bg-gray-50-300 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-gray-50 opacity-70 hover:opacity-100 active:bg-gray-200"
          : "opacity-0"
      }`}
      onClick={onClick}
    >
      {direction === "left" ? <ChevronLeft /> : <ChevronRight />}
    </div>
  );
}

export default ButtonNav;
