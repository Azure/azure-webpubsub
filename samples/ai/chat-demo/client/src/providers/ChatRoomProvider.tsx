import React from 'react';
import type { ReactNode } from 'react';
import { ChatRoomContext } from '../contexts/ChatRoomContext';

interface ChatRoomProviderProps {
  children: ReactNode;
  name: string;
}

export const ChatRoomProvider: React.FC<ChatRoomProviderProps> = ({ children, name }) => {
  const [participantCount, setParticipantCount] = React.useState<number>(1);
  const [isTyping, setIsTyping] = React.useState<boolean>(false);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);

  const value = {
    roomName: name,
    participantCount,
    isTyping,
    typingUsers,
  };

  return (
    <ChatRoomContext.Provider value={value}>
      {children}
    </ChatRoomContext.Provider>
  );
};
