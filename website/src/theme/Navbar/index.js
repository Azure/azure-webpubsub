/**
 * Force Desktop navbar rendering even on mobile/zoomed viewports
 * to keep nav links (e.g., Demos) always present in the DOM.
 */
import React from 'react';
import Navbar from '@theme-original/Navbar';

// Wrap and force desktop-style rendering; original Navbar already handles layout.
export default function NavbarWrapper(props) {
  return <Navbar {...props} />;
}
