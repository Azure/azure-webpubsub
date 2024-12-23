import React, { useEffect } from 'react'
import { CopyBlock, github } from 'react-code-blocks'

function CodeBlock({ text, language, title }) {
  useEffect(() => {
    // Add aria-label dynamically to the button inside the CopyBlock
    const buttons = document.querySelectorAll('.copy-button-aria button[type="button"]');
    buttons.forEach((button) => {
        button.setAttribute('aria-label', 'Copy code to clipboard');
    });
  }, []);

  return (
    <div className="mb-3 copy-button-aria">
      {title && <h5 className="font-bold">{title}</h5>}
      <CopyBlock text={text} language={language} showLineNumbers codeBlock wrapLines theme={github} />
        <style>
          {`
            /* Target all buttons inside any code block container */
            .mb-3 button[type="button"]:focus,
            .mb-3 button[type="button"]:focus-visible {
            outline: 2px solid #FFD700 !important; /* Bright yellow outline */
            outline-offset: 4px !important;        /* Space between outline and button */
            box-shadow: 0 0 6px 2px rgba(255, 215, 0, 0.8) !important; /* Glow effect */
            border-radius: 4px;                   /* Smooth rounded corners */
            }
            /* Optional hover state for better UX */
            .mb-3 button[type="button"]:hover {
            box-shadow: 0 0 6px 2px rgba(255, 184, 0, 0.8);
            }
          `}
        </style>
    </div>
  )
}

export default CodeBlock
