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
            /* Improve Copy Button Contrast */
            .mb-3 button[type="button"] {
            background-color: #333 !important; /* Darker background for better contrast */
            color: #fff !important;           /* White text/icon for maximum contrast */
            border: 1px solid #ccc;           /* Light gray border for visibility */
            padding: 6px 12px;                /* Comfortable padding */
            border-radius: 4px;               /* Rounded edges for accessibility */
            transition: background-color 0.2s ease-in-out;
            }
            /* Focus State - Ensures good keyboard navigation */
            .mb-3 button[type="button"]:focus,
            .mb-3 button[type="button"]:focus-visible {
            outline: 3px solid #FFD700 !important; /* Bright yellow outline */
            outline-offset: 4px !important;
            box-shadow: 0 0 6px 2px rgba(255, 215, 0, 0.8) !important;
            }
            /* Hover State - Improve visibility on hover */
            .mb-3 button[type="button"]:hover {
            background-color: #555 !important; /* Slightly lighter for contrast */
            box-shadow: 0 0 6px 2px rgba(255, 184, 0, 0.8);
            }
            /* Active State - Ensure it's clearly visible when clicked */
            .mb-3 button[type="button"]:active {
            background-color: #777 !important;
            }
          `}
            </style>
        </div>
    )
}

export default CodeBlock
