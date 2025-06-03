import React from 'react'

function TextBlock({ title, children }) {
  return (
    <div className="mt-5 mb-2">
      <div className="mb-1 font-sans font-semibold text-lg">{title}</div>
      {children}
    </div>
  )
}

export default TextBlock
