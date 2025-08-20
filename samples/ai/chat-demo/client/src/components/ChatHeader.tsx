import React, { useContext, useMemo } from "react";
import { useChatClient } from '../hooks/useChatClient';
import { AvatarContext } from "../contexts/AvatarContext";

interface ChatHeaderProps {
  roomId: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ roomId }) => {
  const { connectionStatus } = useChatClient();
  const { displayName } = useContext(AvatarContext);

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
            <h1>AI Chat{roomId ? ` · Room ${roomId}` : ""}</h1>
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
