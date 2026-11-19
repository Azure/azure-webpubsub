import React from 'react';

interface OnlineStatusIndicatorProps {
  isOnline: boolean;
  size?: number;
}

export const OnlineStatusIndicator: React.FC<OnlineStatusIndicatorProps> = ({ 
  isOnline, 
  size = 16 // Increased default size further
}) => {
  return (
    <div
      className={`online-status-indicator ${isOnline ? 'online' : 'offline'}`}
      style={{
        '--indicator-size': `${size}px`,
      } as React.CSSProperties}
      title={isOnline ? 'Online' : 'Offline'}
    />
  );
};