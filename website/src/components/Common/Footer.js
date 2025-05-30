import React, { useState, useEffect } from 'react'

function Footer() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(window.siteConsent.isConsentRequired)
  })

  return (
    <footer className="flex justify-center bg-gray-100  py-2 text-xs tracking-wider text-gray-600">
      <ul className="flex gap-3">
        <li>
          <h6><a href="https://go.microsoft.com/fwlink/?LinkId=521839"><u>Privacy</u></a></h6>
        </li>
        <li>
          <h6><a href="https://go.microsoft.com/fwlink/?LinkID=206977"><u>Terms of Use</u></a></h6>
        </li>
        <li>
          <h6><a href="https://go.microsoft.com/fwlink/?linkid=2196228"><u>Trademarks</u></a></h6>
        </li>
        {visible && (
          <li
            className="cursor-pointer"
            onClick={() => {
              console.log('hello.')
              window.siteConsent.manageConsent()
            }}
          >
            Manage cookies
          </li>
        )}

        <li><h6>{`© Microsoft ${new Date().getFullYear()}`}</h6></li>
      </ul>
    </footer>
  )
}

export default Footer
