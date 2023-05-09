import React from 'react'

function TextBlock({ title, children }) {
  return (
    <div className="mt-5 mb-2">
      <h3 className="mb-1 font-sans font-semibold">{title}</h3>
      {children}
    </div>
  )
}

export default TextBlock
