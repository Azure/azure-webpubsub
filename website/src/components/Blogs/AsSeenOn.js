import React from "react";

import GeeksForGeeks from "@site/static/logos/logo_geeksforgeeks.png";
import Medium from "@site/static/logos/logo_medium.png";
import Dev from "@site/static/logos/logo_dev.png";
import FreeCodeCamp from "@site/static/logos/logo_freecodecamp.png";

import ExternalLink from "@site/static/icons/externallink.svg";

function AsSeenOn() {
  return (
    <div className="my-6 bg-slate-100 pb-6">
      <h6 className=" py-3 text-center text-lg font-bold text-gray-800">
        As seen on
      </h6>
      <div className="flex max-w-full justify-center">
        <div className="flex gap-8">
          <a
            href="https://www.geeksforgeeks.org/"
            target="_blank"
            className="flex text-blue-500"
          >
            <img className="h-4" src={GeeksForGeeks} />
            <ExternalLink className="icon_inline" />
          </a>
          <a
            href="https://medium.com/"
            target="_blank"
            className="flex text-blue-600"
          >
            <img className="h-4" src={Medium} />
            <ExternalLink className="icon_inline" />
          </a>
          <a
            href="https://dev.to/"
            target="_blank"
            className="flex text-blue-500"
          >
            <img className="h-4" src={Dev} />
            <ExternalLink className="icon_inline" />
          </a>
          <a
            href="https://www.freecodecamp.org/"
            target="_blank"
            className="flex text-blue-500"
          >
            <img className="h-4" src={FreeCodeCamp} />
            <ExternalLink className="icon_inline" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default AsSeenOn;
