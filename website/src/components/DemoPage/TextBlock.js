import React from 'react'

/**
 * Render a semantic heading for section titles in overview tabs.
 * Default heading level is h2 to follow the page's main h1.
 */
function TextBlock({ title, children, level = 2 }) {
  const HeadingTag = `h${Math.min(Math.max(level, 2), 6)}` // clamp between h2 and h6

  return (
    <div className="mt-5 mb-2">
      <HeadingTag className="mb-1 font-sans font-semibold text-lg">{title}</HeadingTag>
      {children}
    </div>
  )
}

export default TextBlock
