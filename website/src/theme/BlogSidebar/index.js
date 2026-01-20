/**
 * Force blog sidebar to always render the desktop variant
 * (avoids window.innerWidth zoom issues). Wraps the original component.
 */
import React from 'react';
import BlogSidebarDesktop from '@theme-original/BlogSidebar/Desktop';

export default function BlogSidebar({sidebar}) {
  if (!sidebar?.items?.length) {
    return null;
  }

  return <BlogSidebarDesktop sidebar={sidebar} />;
}
