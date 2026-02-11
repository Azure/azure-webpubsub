import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Button, FormField } from '../utils/sharedComponents';

interface JoinRoomDialogProps {
  isOpen: boolean;
  onJoinRoom: (roomId: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export const JoinRoomDialog: React.FC<JoinRoomDialogProps> = ({ 
  isOpen, 
  onJoinRoom, 
  onClose, 
  isLoading = false 
}) => {
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!roomId.trim()) {
      setError('Room ID is required');
      return;
    }

    setError('');
    onJoinRoom(roomId.trim());
  };

  const handleClose = () => {
    setRoomId('');
    setError('');
    onClose();
  };

  return createPortal(
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose}
      title="Join Existing Room"
    >


      <form onSubmit={handleSubmit} className="flex flex-col gap-[24px]">
        <FormField
          label="Room ID"
          type="text"
          value={roomId}
          onChange={(value) => {
            setRoomId(value);
            if (error) setError('');
          }}
          error={error}
          placeholder="Enter room ID"
        />

        <div className="flex gap-[12px] justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
          >
            Cancel
          </Button>
          
          <Button
            type="submit"
            variant="success"
            disabled={!roomId.trim()}
            loading={isLoading}
          >
            Join Room
          </Button>
        </div>
      </form>
    </Modal>,
    document.body
  );
};