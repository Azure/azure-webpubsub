import React from 'react';
import type { ReactNode } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { getOrGenerateIdFromUrl, updateUrlWithId, generateId } from '../utils/roomUtils';

interface ChatSettingsProviderProps {
  children: ReactNode;
}

export const ChatSettingsProvider: React.FC<ChatSettingsProviderProps> = ({ children }) => {
  // Initialize room ID from URL or generate a new one
  const [roomId, setRoomId] = React.useState<string>(() => {
    const initialRoomId = getOrGenerateIdFromUrl("roomId", "room");
    updateUrlWithId(initialRoomId, "roomId");
    return initialRoomId;
  });

  // Maintain a simple list of rooms (ids). Seed with current room.
  const [rooms, setRooms] = React.useState<string[]>(() => [roomId]);

  // Update URL when room ID changes
  React.useEffect(() => {
    updateUrlWithId(roomId, "roomId");
  }, [roomId]);

  const addRoom = React.useCallback((id?: string) => {
    const newId = id && id.trim().length > 0 ? id : generateId("room");
    setRooms(prev => (prev.includes(newId) ? prev : [...prev, newId]));
    setRoomId(newId);
    return newId;
  }, []);

  const removeRoom = React.useCallback((id: string) => {
    setRooms(prev => {
      const filtered = prev.filter(r => r !== id);
      if (id === roomId) {
        const next = filtered[0] || generateId("room");
        if (!filtered.includes(next)) filtered.push(next);
        setRoomId(next);
      }
      return filtered;
    });
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
