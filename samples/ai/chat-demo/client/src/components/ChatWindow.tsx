import React from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

export const ChatWindow: React.FC = () => {
  return (
    <div className="chat-container">
      <div className="main">
        <ChatHeader />
        <div className="chat-area">
          <div className="chat-background"></div>
          <ChatMessages />
          <ChatInput />
        </div>
      </div>
    <footer>
    &copy; Web PubSub AI Chat Demo
    </footer>
    </div>
  );
};
