import React, { useContext } from 'react';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatStatusBanner } from './ChatStatusBanner';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { useChatClient } from '../hooks/useChatClient';
import { ChatRoomContext } from '../contexts/ChatRoomContext';

export const ChatWindow: React.FC = () => {
  const { getTypingUsersForRoom } = useChatClient();
  const chatRoom = useContext(ChatRoomContext);
  const roomId = chatRoom?.room?.id;
  const typingUsers = roomId ? getTypingUsersForRoom(roomId) : [];

  return (
    <div className="chat-container">
      <div className="main">
        <ChatHeader />
        <div className="chat-area">
          <div className="chat-background"></div>
          <ChatStatusBanner />
          <ChatMessages />
          <TypingIndicator typingUsers={typingUsers} />
          <ChatInput />
        </div>
      </div>
    </div>
  );
};
