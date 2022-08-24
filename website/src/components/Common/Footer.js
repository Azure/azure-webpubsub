import React from "react";

function Footer() {
  return (
    <footer className="flex justify-center bg-gray-100  py-2 text-xs tracking-wider text-gray-600">
      <ul className="flex gap-3">
        <li>
          <a href="https://privacy.microsoft.com/en-us/privacystatement">
            Privacy
          </a>
        </li>
        <li>
          <a href="https://www.microsoft.com/en-us/legal/terms-of-use">
            Terms of Use
          </a>
        </li>
        <li>
          <a href="https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks">
            Trademarks
          </a>
        </li>
        <p>{`© Microsoft ${new Date().getFullYear()}`}</p>
      </ul>
    </footer>
  );
}

export default Footer;
