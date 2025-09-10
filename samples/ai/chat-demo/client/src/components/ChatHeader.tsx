import React, { useContext, useMemo } from "react";
import { useChatClient } from '../hooks/useChatClient';
import { AvatarContext } from "../contexts/AvatarContext";
import { ChatRoomContext } from "../contexts/ChatRoomContext";

export const ChatHeader: React.FC = () => {
  const { connectionStatus } = useChatClient();
  const avatarContext = useContext(AvatarContext);
  const displayName = avatarContext?.userId;
  const chatRoom = useContext(ChatRoomContext);
  const roomLabel = chatRoom?.room ? (chatRoom.room.name || chatRoom.room.id) : undefined;

  const statusClass = useMemo(() => {
    switch (connectionStatus.status) {
      case "connected": return "header-status connected";
      case "connecting": return "header-status connecting";
      case "error": return "header-status error";
      default: return "header-status disconnected";
    }
  }, [connectionStatus.status]);

  return (
    <header>
      <div className="header-left">
          <div className="header-title" aria-live="polite">
            <h1>AI Chat{roomLabel ? ` · Room ${roomLabel}` : ""}</h1>
            <p>Connected as <strong>{displayName}</strong> {connectionStatus.connectionId}</p>
          </div>
        </div>
        <div className="header-actions" role="status" aria-live="polite">
          <div className={statusClass} title={connectionStatus.message}>
            <span className="status-icon" aria-hidden>●</span>
            <span className="status-text">{connectionStatus.status}</span>
          </div>
        </div>
    </header>
  );
};
