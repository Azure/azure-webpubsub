import React, { useState, useEffect } from 'react'

function Footer() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(window.siteConsent && window.siteConsent.isConsentRequired)
  })

  return (
    <footer className="flex justify-center bg-gray-100  py-2 text-xs tracking-wider text-gray-600">
      <ul className="flex gap-3">
        <li>
          <a href="https://privacy.microsoft.com/en-us/privacystatement"><u>Privacy</u></a>
        </li>
        <li>
          <a href="https://www.microsoft.com/en-us/legal/terms-of-use"><u>Terms of Use</u></a>
        </li>
        <li>
          <a href="https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks"><u>Trademarks</u></a>
        </li>
        {visible && (
          <li
            className="cursor-pointer"
            onClick={() => {
              window.siteConsent.manageConsent()
            }}
          >
            Manage cookies
          </li>
        )}

        <li>{`© Microsoft ${new Date().getFullYear()}`}</li>
      </ul>
    </footer>
  )
}

export default Footer
