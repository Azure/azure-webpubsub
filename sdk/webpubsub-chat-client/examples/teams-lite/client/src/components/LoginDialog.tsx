import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Button, FormField, ErrorDisplay } from '../utils/sharedComponents';

interface LoginDialogProps {
  isOpen: boolean;
  onLogin: (userId: string, password: string) => void;
  isLoading?: boolean;
}

export const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onLogin, isLoading = false }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('88888888');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!userId.trim()) {
      setError('User ID is required');
      return;
    }
    
    onLogin(userId.trim(), password);
  };

  return createPortal(
    <Modal isOpen={isOpen} onClose={() => {}} title="Welcome to TeamsLite">
      {error && <ErrorDisplay message={error} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-[24px]">
        <FormField
          label="User ID"
          type="text"
          value={userId}
          onChange={(value) => {
            setUserId(value);
            if (error) setError('');
          }}
          placeholder="Enter your user ID"
        />
        
        <FormField
          label="Password (Optional)"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Enter password (optional)"
        />

        <Button
          type="submit"
          disabled={!userId.trim() || isLoading}
          onClick={() => {}}
        >
          {isLoading ? 'Logining...' : 'Login'}
        </Button>
      </form>
    </Modal>,
    document.body
  );
};