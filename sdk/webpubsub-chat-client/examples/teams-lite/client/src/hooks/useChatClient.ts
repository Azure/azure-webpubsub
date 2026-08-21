import { useContext } from 'react';
import { ChatClientContext } from '../contexts/ChatClientContext';

export const useChatClient = () => {
  const context = useContext(ChatClientContext);
  if (context === undefined) {
    throw new Error('useChatClient must be used within a ChatClientProvider');
  }
  return context;
};
