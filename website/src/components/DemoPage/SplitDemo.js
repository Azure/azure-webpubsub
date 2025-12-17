import React, { useState, useEffect } from 'react'

import SourceCode from '@site/src/components/Common/SourceCode'
import ButtonLink from '@site/src/components/Common/ButtonLink'
import GitHub from '@site/static/logos/github_logo.svg'

function SplitDemo({
  alert,
  leftSrc,
  rightSrc,
  description,
  languages,
  githubURL
}) {
  return (
    <div className="pattern-dots-sm mb-10 relative">
      {alert && <p className="bg-red-100 py-2 text-center font-bold text-red-900 ">{alert}</p>}
      <div className={`flex flex-col items-center ${leftSrc && rightSrc ? 'gap-6' : 'w-full'} py-4 drop-shadow-xl xl:flex-row`}>
        {leftSrc && (
          <div
            tabIndex={0}
            className={"iframe-focusable-wrapper h-[400px] w-full xl:h-[600px]"}
            style={{ display: 'inline-block', width: '95%' }}
          >
            <iframe
              src={leftSrc}
              title={description}
              tabIndex={-1}
              className="h-[400px] w-full xl:h-[600px]"
            ></iframe>
          </div>
        )}
        {rightSrc && (
          <div
            tabIndex={0}
            className={"iframe-focusable-wrapper h-[400px] w-full xl:h-[600px]"}
            style={{ display: 'inline-block', width: '95%' }}
          >
            <iframe
              src={rightSrc}
              title={description}
              tabIndex={-1}
              className="h-[400px] w-full xl:h-[600px]"
            ></iframe>
          </div>
        )}
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
