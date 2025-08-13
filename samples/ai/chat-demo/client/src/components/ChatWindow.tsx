import React from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

interface ChatWindowProps {
  roomName: string;
  enableTypingIndicators: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ roomName, enableTypingIndicators }) => {
  return (
    <div className="chat-container">
      <div className="main">
        <ChatHeader />
        <div className="chat-area">
          <div className="chat-background"></div>
          <ChatMessages enableTypingIndicators={enableTypingIndicators} />
          <ChatInput />
        </div>
      </div>
    <footer>
    &copy; Web PubSub AI Chat Demo
    </footer>
    </div>
  );
};
