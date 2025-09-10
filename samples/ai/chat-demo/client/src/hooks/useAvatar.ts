import { useContext } from 'react';
import { AvatarContext } from '../contexts/AvatarContext';

export const useAvatar = () => {
  const context = useContext(AvatarContext);
  if (context === undefined) {
    throw new Error('useAvatar must be used within an AvatarProvider');
  }
  return context;
};
