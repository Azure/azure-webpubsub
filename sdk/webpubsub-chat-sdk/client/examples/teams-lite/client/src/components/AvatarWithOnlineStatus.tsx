import React, { useContext } from 'react';
import { getAvatarStyle, getAvatarInitials } from '../utils/avatarUtils';
import type { AvatarStyleOptions } from '../utils/avatarUtils';
import { OnlineStatusIndicator } from './OnlineStatusIndicator';
import { ChatClientContext } from '../contexts/ChatClientContext';

interface AvatarWithOnlineStatusProps extends AvatarStyleOptions {
  userOrRoomId: string;
  title?: string;
  onClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  isUser?: boolean; // Is this the current user's avatar
  isPrivateChat?: boolean; // Is this avatar in a private chat context
}

export const AvatarWithOnlineStatus: React.FC<AvatarWithOnlineStatusProps> = ({
  userOrRoomId,
  title,
  onClick,
  onMouseEnter,
  onMouseLeave,
  // isUser = false,  // unused parameter
  isPrivateChat = false,
  ...styleOptions
}) => {
  const chatContext = useContext(ChatClientContext);
  const style = getAvatarStyle(userOrRoomId, styleOptions);
  const initials = getAvatarInitials(userOrRoomId);
  
  // Show online status in private chat context, including personal rooms (private-user-user)
  // In personal rooms, we want to show the user's own online status
  const shouldShowOnlineStatus = isPrivateChat;
  const isOnline = shouldShowOnlineStatus && chatContext?.onlineStatus[userOrRoomId]?.isOnline || false;

  return (
    <div
      className="avatar-container"
      style={style}
      title={title || userOrRoomId}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {initials}
      {shouldShowOnlineStatus && (
        <OnlineStatusIndicator 
          isOnline={isOnline} 
          size={Math.max(12, (styleOptions.size || 32) * 0.4)} // Larger indicator
        />
      )}
    </div>
  );
};