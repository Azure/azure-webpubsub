import React from 'react'

import ExternalLink from '@site/static/icons/externallink.svg'

function HyperLink({ to, text = 'here', openInNewTab = true }) {
  return (
    <a href={to} className="font-bold text-blue-600 hover:underline" target={openInNewTab ? '_blank' : ''}>
      {text}
      <ExternalLink className="icon_inline" />
    </a>
  )
}

export default HyperLink
