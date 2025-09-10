import { createContext } from 'react';

export interface AvatarContextType {
  userId?: string;
  setUserId: (name?: string) => void;
}

export const AvatarContext = createContext<AvatarContextType | undefined>(undefined);
