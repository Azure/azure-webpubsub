import React from 'react'

function ButtonLink({ text, to, children, openInNewTab = true, tabIndex = 0, ariaLabel = "" }) {
    text = text.replace(/ /g, '\u00a0'); 
    return (
        <a href={to} target={openInNewTab ? '_blank' : ''} className="absolute bottom-4 flex items-center font-semibold justify-center rounded-sm bg-blue-600 px-5 py-2 text-sm text-gray-100 hover:bg-blue-700 gap-2" tabindex={tabIndex} aria-label={ariaLabel} role="button" >
            {children && <div className="w-5">{children}</div>}
            <div>
                {text}
            </div>
        </a >
    )

}

export default ButtonLink
