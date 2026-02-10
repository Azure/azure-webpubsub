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

  const { roomId, rooms } = settings;
  const room: ChatRoom | null = useMemo(() => {
    if (!roomId) return null;
    const meta = rooms.find(r => r.roomId === roomId);
    return { id: roomId, name: meta?.roomName || roomId };
  }, [roomId, rooms]);

  const value = useMemo(() => ({ room }), [room]);

  return (
    <ChatRoomContext.Provider value={value}>
      {children}
    </ChatRoomContext.Provider>
  );
};
