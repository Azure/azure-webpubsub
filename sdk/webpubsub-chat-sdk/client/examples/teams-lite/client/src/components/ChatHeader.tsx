import React, { useContext, useState, useEffect } from "react";
import { useChatClient } from '../hooks/useChatClient';
import { ChatRoomContext } from "../contexts/ChatRoomContext";
import { ChatSettingsContext } from '../contexts/ChatSettingsContext';
import { ChatClientContext } from '../contexts/ChatClientContext';
import { usePrivateChat } from '../hooks/usePrivateChat';
import { AvatarWithOnlineStatus } from './AvatarWithOnlineStatus';
import { UserProfileCard } from './UserProfileCard';
import { AddToRoomDialog } from './AddToRoomDialog';

export const ChatHeader: React.FC = () => {
  const { connectionStatus } = useChatClient();
  const settingsContext = useContext(ChatSettingsContext);
  const clientContext = useContext(ChatClientContext);
  const [roomMembersInfo, setRoomMembersInfo] = useState<{ count: number; members: string[] } | null>(null);
  const [showMembersList, setShowMembersList] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [isAddToRoomDialogOpen, setIsAddToRoomDialogOpen] = useState(false);
  const [isAddingUsers, setIsAddingUsers] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const { createOrJoinPrivateChat } = usePrivateChat();
  const chatRoom = useContext(ChatRoomContext);
  const roomId = chatRoom?.room ? chatRoom.room.id : undefined;
  const roomName = chatRoom?.room ? chatRoom.room.name : undefined;

  // Fetch member info for current room
  useEffect(() => {
    const fetchRoomMembers = async () => {
      if (!clientContext?.client || !roomId) {
        setRoomMembersInfo(null);
        return;
      }
      
      try {
        console.log("trying to fetch room members for room:", roomId);
        const roomInfo = await clientContext.client.getRoom(roomId, true);
        console.log("fetched room member info:", roomInfo);
        const members = (roomInfo as any).members || [];
        setRoomMembersInfo({
          count: members.length,
          members: members
        });
      } catch (error) {
        console.log(`Failed to get member info for room ${roomId}:`, error);
        setRoomMembersInfo({ count: 0, members: [] });
      }
    };

    fetchRoomMembers();
  }, [clientContext?.client, roomId]);

  // Close members list when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMembersList) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-members-dropdown]')) {
          setShowMembersList(false);
        }
      }
    };

    if (showMembersList) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMembersList]);

  const copyRoomId = async () => {
    if (roomId) {
      try {
        await navigator.clipboard.writeText(roomId);
        console.log('Room ID copied to clipboard:', roomId);
        // You could add a toast notification here
      } catch (err) {
        console.error('Failed to copy room ID:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = roomId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    }
  };

  const handleLogout = async () => {
    // Disconnect the chat client
    if (clientContext?.client) {
      try {
        await clientContext.client.stop();
      } catch (error) {
        console.error('Error disconnecting client:', error);
      }
    }
    // Refresh the page to reset all state
    window.location.reload();
  };

  const handleAddToRoom = async (userIds: string[]) => {
    if (!roomId || !clientContext?.client) return;
    
    setIsAddingUsers(true);
    setErrorMessage("");
    try {
      // Add users to room using the client
      for (const userId of userIds) {
        await (clientContext.client as any).addUserToRoom(roomId, userId);
      }
      setIsAddToRoomDialogOpen(false);
      // Refresh room members info
      const roomInfo = await clientContext.client.getRoom(roomId, true);
      const members = (roomInfo as any).members || [];
      setRoomMembersInfo({
        count: members.length,
        members: members
      });
    } catch (error) {
      console.error('Error adding users to room:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to add users to room';
      setErrorMessage(errorMsg);
    } finally {
      setIsAddingUsers(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    console.log("Removing user from room:", userId, roomId);
    if (!roomId || !clientContext?.client) return;
    
    setRemovingUserId(userId);
    setErrorMessage("");
    try {
      // Remove user from room using the client
      await (clientContext.client as any).removeUserFromRoom(roomId, userId);
      
      // Refresh room members info
      const roomInfo = await clientContext.client.getRoom(roomId, true);
      const members = (roomInfo as any).members || [];
      setRoomMembersInfo({
        count: members.length,
        members: members
      });
      
      // Show success notification
      clientContext.setSuccessNotification(`Successfully removed user ${userId} from the room`);
      
      // Auto-clear the notification after 5 seconds
      setTimeout(() => {
        clientContext.setSuccessNotification("");
      }, 5000);
    } catch (error) {
      console.error('Error removing user from room:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to remove user from room';
      setErrorMessage(errorMsg);
    } finally {
      setRemovingUserId(null);
    }
  };

  const renderUserAvatar = () => {
    const userId = connectionStatus.userId || settingsContext?.userId;
    if (!userId) return null;

    return (
      <div className="header-user-avatar">
        <span className="header-user-name">
          {userId}
        </span>
        <AvatarWithOnlineStatus
          userOrRoomId={userId}
          size={40}
          fontSize={16}
          isUser={true} // This is current user
          isPrivateChat={true} // Show online status for current user in header
          onClick={() => setShowProfileCard(true)}
          cursor="pointer"
        />
      </div>
    );
  };

  const renderMemberAvatar = (userId: string, size: number = 32) => {
    const currentUserId = connectionStatus.userId || settingsContext?.userId;
    const isCurrentUser = userId === currentUserId;

    return (
      <AvatarWithOnlineStatus
        userOrRoomId={userId}
        size={size}
        fontSize={size * 0.4}
        isUser={isCurrentUser}
        isPrivateChat={true} // Member list always shows online status for users
      />
    );
  };

  const roomTitle = () => {
    if (roomId?.startsWith("private-")) {
      // Private chat room - extract other user from room ID
      const parts = roomId.split("-");
      if (parts.length >= 3) {
        const currentUserId = connectionStatus.userId || settingsContext?.userId;
        const otherUser = parts[1] === currentUserId ? parts[2] : parts[1];
        return `Private Chat: ${otherUser}`;
      }
    }
    return roomName ? `Room: ${roomName}` : 'No Room Selected';
  }

  const currentUserId = connectionStatus.userId || settingsContext?.userId;

  return (
    <header className="relative">
      {/* Dialogs */}
      <AddToRoomDialog
        isOpen={isAddToRoomDialogOpen}
        onAddToRoom={handleAddToRoom}
        onClose={() => {
          setIsAddToRoomDialogOpen(false);
          setErrorMessage("");
        }}
        isLoading={isAddingUsers}
        roomName={roomName}
      />

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="error-banner">
          <span className="error-banner-icon">⚠️</span>
          <span className="error-banner-text">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage("")}
            className="error-banner-close"
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
      )}

      {/* User avatar in top-right corner */}
      {currentUserId && (
        <div className="header-user-position">
          <div className="profile-card-wrapper">
            {renderUserAvatar()}
            {/* User Profile Card - positioned relative to avatar */}
            {showProfileCard && (
              <>
                <div className="profile-card-backdrop" onClick={() => setShowProfileCard(false)} />
                <UserProfileCard
                  userId={currentUserId}
                  onClose={() => setShowProfileCard(false)}
                  onLogout={handleLogout}
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="header-left">
          <div className="header-title" aria-live="polite">
            <div className="header-actions-row">
              {/* if the room name contains '<->, then its a private chat, otherwise its a room */}
              {/* if its a private chat, extract the other user name */}
              <h1> { roomTitle() } </h1>
              {roomMembersInfo && !roomId?.startsWith('private-') && (
                <div className="members-dropdown-container" data-members-dropdown>
                  <button 
                    onClick={() => setShowMembersList(!showMembersList)}
                    className={`members-btn ${showMembersList ? 'active' : ''}`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    <span>{roomMembersInfo.count}</span>
                  </button>
                  
                  {showMembersList && (
                    <div className="members-dropdown">
                      <div className="members-dropdown-content">
                        <div className="members-dropdown-header">
                          Members ({roomMembersInfo.count})
                        </div>
                        {roomMembersInfo.members.map((member) => {
                          const currentUserId = connectionStatus.userId || settingsContext?.userId;
                          const isCurrentUser = member === currentUserId;
                          const isRemoving = removingUserId === member;
                          
                          return (
                            <div
                              key={member}
                              className={`member-item ${isCurrentUser ? 'current-user' : ''}`}
                            >
                              <div
                                onClick={async () => {
                                  if (!isCurrentUser) {
                                    await createOrJoinPrivateChat(member);
                                    setShowMembersList(false);
                                  }
                                }}
                                className="member-item-content"
                              >
                                {renderMemberAvatar(member, 24)}
                                <span>{member} {isCurrentUser && '(You)'}</span>
                              </div>
                              {!isCurrentUser && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveUser(member);
                                  }}
                                  className="member-remove-btn"
                                  disabled={isRemoving}
                                  title="Remove user from room"
                                >
                                  {isRemoving ? (
                                    <svg
                                      className="spinner"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                    >
                                      <circle cx="12" cy="12" r="10" strokeWidth="3" strokeLinecap="round" />
                                    </svg>
                                  ) : (
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })}
                        
                        {/* Room Management Actions */}
                        <div className="members-dropdown-divider" />
                        <div className="members-dropdown-actions">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsAddToRoomDialogOpen(true);
                              setShowMembersList(false);
                            }}
                            className="member-action-btn"
                            title="Add users to this room"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                            Add to Room
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
                {roomId && !roomId.startsWith('private-') && (
                  <button
                    onClick={copyRoomId}
                    className="copy-room-btn"
                    title="Copy Room ID to clipboard"
                  >
                    Copy Room ID
                  </button>
                )}
              </div>
            <div className="header-actions-small">
              <p>RoomName: {roomName} | RoomId: {roomId}</p>
            </div>
          </div>
        </div>
    </header>
  );
};
