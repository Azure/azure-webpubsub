import React, { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Button } from '../utils/sharedComponents';

interface RemoveFromRoomDialogProps {
  isOpen: boolean;
  onRemoveFromRoom: (userIds: string[]) => void;
  onClose: () => void;
  isLoading?: boolean;
  roomName?: string;
}

export const RemoveFromRoomDialog: React.FC<RemoveFromRoomDialogProps> = ({ 
  isOpen, 
  onRemoveFromRoom, 
  onClose, 
  isLoading = false,
  roomName
}) => {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const handleInputChange = (value: string) => {
    setInputValue(value);
    
    // Check if user typed a comma
    if (value.includes(',')) {
      const newIds = value.split(',').map(id => id.trim()).filter(id => id.length > 0);
      if (newIds.length > 0) {
        const lastId = newIds[newIds.length - 1];
        const idsToAdd = newIds.slice(0, -1);
        
        // Add all complete IDs (before the last comma)
        if (idsToAdd.length > 0) {
          const updatedIds = [...userIds, ...idsToAdd.filter(id => !userIds.includes(id))];
          setUserIds(updatedIds);
        }
        
        // Keep the remaining text after the last comma
        setInputValue(lastId);
      } else {
        setInputValue('');
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmedValue = inputValue.trim();
      if (trimmedValue && !userIds.includes(trimmedValue)) {
        setUserIds([...userIds, trimmedValue]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && userIds.length > 0) {
      // Remove last ID when backspace is pressed and input is empty
      setUserIds(userIds.slice(0, -1));
    }
  };

  const removeUserId = (indexToRemove: number) => {
    setUserIds(userIds.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (userIds.length === 0) {
      setError('At least one user ID is required');
      return;
    }

    setError('');
    onRemoveFromRoom(userIds);
  };

  const handleClose = () => {
    setUserIds([]);
    setInputValue('');
    setError('');
    onClose();
  };

  return createPortal(
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose}
      title={`Remove Members from ${roomName || 'Room'}`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-[24px]">
        <div className="mb-[16px]">
          <label className="block mb-[8px] font-medium text-[#374151]">
            User IDs *
          </label>
          <div className="border border-[#d1d5db] rounded-[8px] p-[10px] min-h-[42px] flex flex-wrap items-center gap-[8px] bg-white cursor-text">
            {userIds.map((userId, index) => (
              <div
                key={index}
                className="inline-flex items-center bg-[#e3f2fd] text-[#1976d2] py-[6px] px-[16px] rounded-[16px] text-[14px] border border-[#bbdefb]"
              >
                <span className="mr-[8px]">{userId}</span>
                <button
                  type="button"
                  onClick={() => removeUserId(index)}
                  className="bg-transparent border-none cursor-pointer text-[#1976d2] text-[16px] leading-none p-0"
                >
                  ×
                </button>
              </div>
            ))}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={userIds.length === 0 ? 'Enter user IDs separated by comma or press Enter' : ''}
              className="border-none outline-none flex-1 min-w-[120px] text-[14px] p-[4px]"
            />
          </div>
          {error && <p className="text-[#ef4444] text-[14px] mt-[8px]">{error}</p>}
        </div>

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
            variant="primary"
            disabled={userIds.length === 0}
            loading={isLoading}
          >
            Remove from Room
          </Button>
        </div>
      </form>
    </Modal>,
    document.body
  );
};
