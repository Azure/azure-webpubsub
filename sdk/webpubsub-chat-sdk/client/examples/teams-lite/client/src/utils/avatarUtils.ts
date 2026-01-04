import React from 'react';

// Consistent color palette for avatars
const AVATAR_COLORS = [
  '#ef4444', // red
  '#f97316', // orange  
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e'  // rose
];

/**
 * Generate a consistent color for a user based on their ID
 * @param userId - The user ID to generate color for
 * @returns The hex color string
 */
export const getAvatarColor = (userId: string): string => {
  if (!userId) return '#6b7280'; // gray fallback
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

/**
 * Get initials from user ID (first character, uppercase)
 * @param userId - The user ID to get initials from
 * @returns The initials string
 */
export const getAvatarInitials = (userId: string): string => {
  if (!userId) return 'U';
  return userId.charAt(0).toUpperCase();
};

/**
 * Avatar style options
 */
export interface AvatarStyleOptions {
  size?: number;
  fontSize?: number;
  cursor?: string;
  margin?: string;
  flexShrink?: number;
}

/**
 * Generate consistent avatar styles using CSS custom properties
 * @param userId - The user ID to generate styles for
 * @param options - Style options
 * @returns CSS style object with custom properties
 */
export const getAvatarStyle = (userId: string, options: AvatarStyleOptions = {}) => {
  const {
    size = 32,
    fontSize = size * 0.4,
    cursor = 'default',
    margin = '0',
    flexShrink = 0
  } = options;

  return {
    '--avatar-size': `${size}px`,
    '--avatar-bg-color': getAvatarColor(userId),
    '--avatar-font-size': `${fontSize}px`,
    '--avatar-cursor': cursor,
    '--avatar-margin': margin,
    '--avatar-flex-shrink': flexShrink,
  } as React.CSSProperties;
};

/**
 * Create a reusable avatar component
 * @param userId - The user ID to create avatar for
 * @param options - Style and behavior options
 * @returns JSX Element
 */
export const createAvatar = (
  userId: string, 
  options: AvatarStyleOptions & {
    title?: string;
    onClick?: () => void;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
  } = {}
) => {
  const { title, onClick, onMouseEnter, onMouseLeave, ...styleOptions } = options;
  const style = getAvatarStyle(userId, styleOptions);
  const initials = getAvatarInitials(userId);

  return React.createElement('div', {
    style,
    title: title || userId,
    onClick,
    onMouseEnter,
    onMouseLeave,
    children: initials
  });
};