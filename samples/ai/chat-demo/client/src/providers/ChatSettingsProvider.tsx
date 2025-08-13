import React from 'react';
import type { ReactNode } from 'react';
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { getRoomIdFromUrl, updateUrlWithRoomId } from '../utils/roomUtils';

interface ChatSettingsProviderProps {
  children: ReactNode;
}

export const ChatSettingsProvider: React.FC<ChatSettingsProviderProps> = ({ children }) => {
  // Initialize room ID from URL or generate a new one
  const [roomId, setRoomId] = React.useState<string>(() => {
    const initialRoomId = getRoomIdFromUrl();
    // Update URL with the room ID if it wasn't already there
    updateUrlWithRoomId(initialRoomId);
    return initialRoomId;
  });

  const [enableTypingIndicators, setEnableTypingIndicators] = React.useState<boolean>(true);
  const [enableMessageHistory, setEnableMessageHistory] = React.useState<boolean>(true);

  // Update URL when room ID changes
  React.useEffect(() => {
    updateUrlWithRoomId(roomId);
  }, [roomId]);

  const value = {
    roomId,
    setRoomId,
    enableTypingIndicators,
    setEnableTypingIndicators,
    enableMessageHistory,
    setEnableMessageHistory,
  };

  return (
    <ChatSettingsContext.Provider value={value}>
      {children}
    </ChatSettingsContext.Provider>
  );
};
