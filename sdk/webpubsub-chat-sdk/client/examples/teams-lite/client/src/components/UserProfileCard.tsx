import React from 'react';
import { AvatarWithOnlineStatus } from './AvatarWithOnlineStatus';

interface UserProfileCardProps {
  userId: string;
  onClose: () => void;
  onLogout: () => void;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({
  userId,
  onClose,
  onLogout,
}) => {
  return (
    <div className="profile-card">
      <div className="profile-card-header">
        <AvatarWithOnlineStatus
          userOrRoomId={userId}
          size={40}
          fontSize={16}
          isUser={true}
          isPrivateChat={true}
        />
        <div className="profile-card-info">
          <h3 className="profile-card-name">{userId}</h3>
          <p className="profile-card-status">
            <span className="profile-status-dot online" />
            Online
          </p>
        </div>
      </div>
      
      <div className="profile-card-divider" />
      
      <div className="profile-card-actions">
        <button 
          className="profile-card-action-btn logout-btn"
          onClick={onLogout}
        >
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16,17 21,12 16,7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
};
