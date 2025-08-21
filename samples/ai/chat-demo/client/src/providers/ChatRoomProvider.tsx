import React, { useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ChatRoomContext, type ChatRoom } from '../contexts/ChatRoomContext';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

interface ChatRoomProviderProps {
  children: ReactNode;
}

export const ChatRoomProvider: React.FC<ChatRoomProviderProps> = ({ children }) => {
  const settings = useContext(ChatSettingsContext);
  if (!settings) throw new Error('ChatRoomProvider must be used within ChatSettingsProvider');

  const { roomId } = settings;
  const room: ChatRoom | null = useMemo(() => (roomId ? { id: roomId, name: roomId } : null), [roomId]);

  const value = useMemo(() => ({ room }), [room]);

  return (
    <ChatRoomContext.Provider value={value}>
      {children}
    </ChatRoomContext.Provider>
  );
};
