import React, { useState, useEffect } from 'react'

import SourceCode from '@site/src/components/Common/SourceCode'
import ButtonLink from '@site/src/components/Common/ButtonLink'
import GitHub from '@site/static/logos/github_logo.svg'

function SplitDemo({ alert, leftSrc, rightSrc, description, languages, githubURL }) {
  // Prevent iframe from being focused by tab, this whiteboard function is designed to be just by mouse
  return (
    <div className="pattern-dots-sm mb-10 relative">
      {alert && <p className="bg-red-100 py-2 text-center font-bold text-red-900 ">{alert}</p>}
      <div className={`flex flex-col items-center ${leftSrc && rightSrc ? 'gap-6' : 'w-full'} py-4 drop-shadow-xl xl:flex-row`}>
        {leftSrc && <iframe src={leftSrc} title={description} className="h-[400px] w-[95%] xl:h-[600px]">></iframe>}
        {rightSrc && <iframe src={rightSrc} title={description} className="h-[400px] w-[95%] xl:h-[600px]">></iframe>}
      </div>
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-around mt-8">
        <ButtonLink text="View source" to={githubURL}>
          <GitHub className="lightIcon" />

        </ButtonLink>
        <div className="w-[90%] xl:w-2/3">
          <SourceCode languages={languages} />
        </div>
      </div>
    </div>
  )
}

export default SplitDemo
