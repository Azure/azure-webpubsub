import React from 'react'
import CodePercent from '@site/src/components/Common/CodePercent'
import { LANGUAGE_COLORS } from './LanguageColors'

function SourceCode({ languages }) {
  return (
    <div className="my-4">
      <div className="flex gap-10">
        {languages.map(item => (
          <CodePercent lang={item.language} percent={item.percent} key={item.language} />
        ))}
      </div>
      <div className="flex overflow-hidden rounded-full bg-gray-300">
        {languages.map(propItem => {
          let languageColor = LANGUAGE_COLORS.find(item => item.language === propItem.language).color
          return (
            <div
              style={{
                backgroundColor: languageColor,
                width: propItem.percent + '%',
              }}
              className="h-2 flex-auto"
              key={propItem.language}
            ></div>
          )
        })}
      </div>
    </div>
  )
}

export default SourceCode

// flex flex-col items-end gap-1 p-6

// flex w-1/2
