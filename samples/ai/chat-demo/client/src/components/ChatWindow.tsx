import React from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatStatusBanner } from './ChatStatusBanner';
import { ChatInput } from './ChatInput';

export const ChatWindow: React.FC = () => {
  return (
    <div className="chat-container">
      <div className="main">
        <ChatHeader />
        <div className="chat-area">
          <div className="chat-background"></div>
          <ChatStatusBanner />
          <ChatMessages />
          <ChatInput />
        </div>
      </div>
    <footer>
    </footer>
    </div>
  );
};
