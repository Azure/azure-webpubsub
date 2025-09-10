import React from 'react';
import type { ReactNode } from 'react';
import { AvatarContext } from '../contexts/AvatarContext';
import { getIdFromUrl, updateUrlWithId } from '../utils/roomUtils';

interface AvatarProviderProps {
  children: ReactNode;
}

export const AvatarProvider: React.FC<AvatarProviderProps> = ({ children }) => {
  const [userId, setUserId] = React.useState<string | undefined>(() => {
      return getIdFromUrl("userId") || undefined;
    });

  // Update URL when user ID changes
  React.useEffect(() => {
    updateUrlWithId(userId, "userId");
  }, [userId]);
  const value = {
    userId,
    setUserId,
  };

  return (
    <AvatarContext.Provider value={value}>
      {children}
    </AvatarContext.Provider>
  );
};
