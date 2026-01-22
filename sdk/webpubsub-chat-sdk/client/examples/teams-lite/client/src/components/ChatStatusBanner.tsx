import React from 'react';
import { useChatClient } from '../hooks/useChatClient';

export const ChatStatusBanner: React.FC = () => {
  const { connectionStatus, uiNotice } = useChatClient();

  // Prefer explicit UI notices; otherwise reflect connection lifecycle succinctly.
  const fallback = (() => {
    if (connectionStatus.status === 'error' || connectionStatus.status === 'disconnected') {
      return { type: 'error' as const, text: connectionStatus.message };
    }
    if (connectionStatus.status === 'connecting') {
      return { type: 'info' as const, text: connectionStatus.message };
    }
    return undefined;
  })();
  const active = uiNotice ?? fallback;

  if (!active) return null;

  const isError = active.type === 'error';
  const variant = isError ? 'error' : 'info';

  return (
    <div role="status" aria-live="polite" className={`status-banner ${variant}`}>
      <div className="status-banner-row">
        <div className="status-banner-line" />
        <span className="status-banner-text">{active.text}</span>
        <div className="status-banner-line" />
      </div>
    </div>
  );
};
