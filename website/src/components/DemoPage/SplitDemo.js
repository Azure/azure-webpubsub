import React from "react";

import SourceCode from "@site/src/components/Common/SourceCode";
import ButtonLink from "@site/src/components/Common/ButtonLink";
import GitHub from "@site/static/logos/github_logo.svg";

function SplitDemo({ leftSrc, rightSrc, description, languages, githubURL }) {
  return (
    <div className="pattern-dots-sm mb-10">
      <div className="flex flex-col items-center gap-6 py-4 drop-shadow-xl xl:flex-row">
        <iframe
          src={leftSrc}
          title={description}
          className="h-[400px] w-[95%] xl:h-[600px]"
        ></iframe>
        <iframe
          src={rightSrc}
          title={description}
          className="h-[400px] w-[95%] xl:h-[600px]"
        ></iframe>
      </div>
      <div className="flex flex-col items-center xl:flex-row xl:items-center xl:justify-around">
        <ButtonLink text="View source" to={githubURL}>
          <GitHub className="lightIcon" />
        </ButtonLink>
        <div className="w-[90%] xl:w-2/3">
          <SourceCode languages={languages} />
        </div>
      </div>
    </div>
  );
}

export default SplitDemo;
