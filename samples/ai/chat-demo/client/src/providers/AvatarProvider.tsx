import React from 'react';
import type { ReactNode } from 'react';
import { AvatarContext } from '../contexts/AvatarContext';

interface AvatarProviderProps {
  children: ReactNode;
}

export const AvatarProvider: React.FC<AvatarProviderProps> = ({ children }) => {
  const [avatarUrl, setAvatarUrl] = React.useState<string | undefined>();
  const [displayName, setDisplayName] = React.useState<string | undefined>();

  const value = {
    avatarUrl,
    setAvatarUrl,
    displayName,
    setDisplayName,
  };

  return (
    <AvatarContext.Provider value={value}>
      {children}
    </AvatarContext.Provider>
  );
};
