import React from 'react';
import type { ReactNode } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';

interface ChatSettingsProviderProps {
  children: ReactNode;
}

export const ChatSettingsProvider: React.FC<ChatSettingsProviderProps> = ({ children }) => {
  // Simplify: always use a single default room "public"
  const [roomId, setRoomId] = React.useState<string>("public");
  const [rooms, setRooms] = React.useState<string[]>(["public"]);

  // Add a new room by ID (no random generation)
  const addRoom = React.useCallback((id?: string) => {
    const newId = id?.trim();
    if (!newId) {
      return roomId;
    }
    setRooms(prev => prev.includes(newId) ? prev : [...prev, newId]);
    setRoomId(newId);
    return newId;
  }, [roomId]);

  // Remove a room by ID, fallback to public if current room removed
  const removeRoom = React.useCallback((id?: string) => {
    const removeId = id?.trim();
    if (!removeId || removeId === "public") {
      return;
    }
    setRooms(prev => prev.filter(r => r !== removeId));
    if (roomId === removeId) {
      setRoomId("public");
    }
  }, [roomId]);

  const value = {
    roomId,
    setRoomId,
    rooms,
    addRoom,
    removeRoom,
  };

  return (
    <ChatSettingsContext.Provider value={value}>
      {children}
    </ChatSettingsContext.Provider>
  );
};
