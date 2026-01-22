import React, { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Button, FormField } from '../utils/sharedComponents';

interface CreateRoomDialogProps {
  isOpen: boolean;
  onCreateRoom: (roomName: string, memberIds: string[]) => void;
  onClose: () => void;
  isLoading?: boolean;
}

interface TagInputProps {
  label: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
}

const TagInput: React.FC<TagInputProps> = ({ label, tags, onTagsChange, placeholder }) => {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = (value: string) => {
    setInputValue(value);
    
    // Check if user typed a comma
    if (value.includes(',')) {
      const newTags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      if (newTags.length > 0) {
        const lastTag = newTags[newTags.length - 1];
        const tagsToAdd = newTags.slice(0, -1);
        
        // Add all complete tags (before the last comma)
        if (tagsToAdd.length > 0) {
          const updatedTags = [...tags, ...tagsToAdd.filter(tag => !tags.includes(tag))];
          onTagsChange(updatedTags);
        }
        
        // Keep the remaining text after the last comma
        setInputValue(lastTag);
      } else {
        setInputValue('');
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmedValue = inputValue.trim();
      if (trimmedValue && !tags.includes(trimmedValue)) {
        onTagsChange([...tags, trimmedValue]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      // Remove last tag when backspace is pressed and input is empty
      onTagsChange(tags.slice(0, -1));
    }
  };

  const removeTag = (indexToRemove: number) => {
    onTagsChange(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="mb-[16px]">
      <label className="block mb-[8px] font-medium text-[#374151]">
        {label}
      </label>
      <div className="border border-[#d1d5db] rounded-[8px] p-[10px] min-h-[42px] flex flex-wrap items-center gap-[8px] bg-white cursor-text">
        {tags.map((tag, index) => (
          <div
            key={index}
            className="inline-flex items-center bg-[#e3f2fd] text-[#1976d2] py-[6px] px-[16px] rounded-[16px] text-[14px] border border-[#bbdefb]"
          >
            <span className="mr-[8px]">{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(index)}
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
          placeholder={tags.length === 0 ? placeholder : ''}
          className="border-none outline-none flex-1 min-w-[120px] text-[14px] p-[4px]"
        />
      </div>
    </div>
  );
};

export const CreateRoomDialog: React.FC<CreateRoomDialogProps> = ({ 
  isOpen, 
  onCreateRoom, 
  onClose, 
  isLoading = false 
}) => {
  const [roomName, setRoomName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }

    setError('');
    // memberIds is already an array of strings
    onCreateRoom(roomName.trim(), memberIds);
    
    // Clear the form after successful submission
    setRoomName('');
    setMemberIds([]);
  };

  const handleClose = () => {
    setRoomName('');
    setMemberIds([]);
    setError('');
    onClose();
  };

  return createPortal(
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose}
      title="Create New Room"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-[24px]">
        <FormField
          label="Room Name *"
          type="text"
          value={roomName}
          onChange={(value) => {
            setRoomName(value);
            if (error) setError('');
          }}
          error={error}
          placeholder="Enter room name (required)"
        />
        
        <TagInput
          label="User ID of members (Optional)"
          tags={memberIds}
          onTagsChange={setMemberIds}
          placeholder="Enter User IDs of members, press comma or Enter to add"
        />

        <p className="text-[14px] text-[#6b7280] m-0 italic">
          Click × to remove memeber User ID.
        </p>

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
            disabled={!roomName.trim()}
            loading={isLoading}
          >
            Create Room
          </Button>
        </div>
      </form>
    </Modal>,
    document.body
  );
};