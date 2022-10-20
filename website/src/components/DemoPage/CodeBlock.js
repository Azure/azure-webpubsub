import React from 'react'
import { CopyBlock, dracula } from 'react-code-blocks'

function CodeBlock({ text, language, title }) {
  return (
    <div className="mb-3">
      {title && <h5 className="font-bold">{title}</h5>}
      <CopyBlock text={text} language={language} showLineNumbers codeBlock wrapLines theme={dracula} />
    </div>
  )
}

export default CodeBlock
