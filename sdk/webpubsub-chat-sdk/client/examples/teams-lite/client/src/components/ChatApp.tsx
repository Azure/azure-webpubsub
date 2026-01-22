import React, { useContext } from 'react';
import { ChatRoomProvider } from '../providers/ChatRoomProvider';
import { ChatWindow } from './ChatWindow';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { Sidebar } from './Sidebar';
import { ChatFooter } from './ChatFooter';

export const ChatApp: React.FC = () => {
  const settingsContext = useContext(ChatSettingsContext);
  const clientContext = useContext(ChatClientContext);
  
  if (!settingsContext) {
    throw new Error('ChatApp must be used within ChatSettingsProvider');
  }
  
  return (
    <div className="app-container">
      {/* Success Notification Banner */}
      {clientContext?.successNotification && (
        <div className="success-banner">
          <span className="success-banner-icon">✓</span>
          <span className="success-banner-text">{clientContext.successNotification}</span>
          <button
            onClick={() => clientContext.setSuccessNotification("")}
            className="success-banner-close"
            aria-label="Close success message"
          >
            ×
          </button>
        </div>
      )}
      
      <div className="layout">
        <Sidebar />
        <ChatRoomProvider>
          <ChatWindow />
        </ChatRoomProvider>
      </div>
      <ChatFooter />
    </div>
  );
};
