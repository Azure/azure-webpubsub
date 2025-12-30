import { useContext } from 'react';
import { ChatClientContext } from '../contexts/ChatClientContext';

export const useOnlineStatus = () => {
  const context = useContext(ChatClientContext);
  
  if (!context) {
    throw new Error('useOnlineStatus must be used within a ChatClientProvider');
  }
  
  return {
    onlineStatus: context.onlineStatus,
    isUserOnline: (userId: string) => context.onlineStatus[userId]?.isOnline || false,
    getUserLastSeen: (userId: string) => context.onlineStatus[userId]?.lastSeen || 0
  };
};