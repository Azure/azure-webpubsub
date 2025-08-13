import { createContext } from 'react';

export interface AvatarContextType {
  avatarUrl?: string;
  setAvatarUrl: (url: string) => void;
  displayName: string;
  setDisplayName: (name: string) => void;
}

export const AvatarContext = createContext<AvatarContextType | undefined>(undefined);
