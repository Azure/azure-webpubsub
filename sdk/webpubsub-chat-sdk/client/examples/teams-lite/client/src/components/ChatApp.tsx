import React, { useContext } from 'react';
import { ChatRoomProvider } from '../providers/ChatRoomProvider';
import { ChatWindow } from './ChatWindow';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { Sidebar } from './Sidebar';
import { ChatFooter } from './ChatFooter';

export const ChatApp: React.FC = () => {
  const settingsContext = useContext(ChatSettingsContext);
  
  if (!settingsContext) {
    throw new Error('ChatApp must be used within ChatSettingsProvider');
  }
  
  return (
    <div className="app-container">
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
