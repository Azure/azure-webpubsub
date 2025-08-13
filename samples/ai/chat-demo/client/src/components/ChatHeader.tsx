import React from 'react';
import { useChatClient } from '../hooks/useChatClient';

export const ChatHeader: React.FC = () => {
  const { connectionStatus } = useChatClient();

  const getStatusClass = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'disconnected':
        return 'disconnected';
      case 'error':
        return 'error';
      default:
        return 'disconnected';
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return '●';
      case 'connecting':
        return '◐';
      case 'disconnected':
        return '○';
      case 'error':
        return '✕';
      default:
        return '○';
    }
  };

  return (
    <header>
      <div className="header-left">
        <div className="header-title">
          <h1>AI Agent Chat</h1>
          <p>Powered by Azure Web PubSub</p>
        </div>
      </div>
      <div className="header-actions">
        <div className={`status header-status ${getStatusClass()}`}>
          <span className="status-icon">{getStatusIcon()}</span>
          <span className="status-text">{connectionStatus.message}</span>
          {connectionStatus.connectionId && (
            <span className="connection-id" title={`Connection ID: ${connectionStatus.connectionId}`}>
              {connectionStatus.connectionId.substring(0, 8)}...
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
