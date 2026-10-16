import React from 'react';

// 模态框组件
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-container">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

// 按钮组件
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'success';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  type?: 'button' | 'submit';
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  disabled = false, 
  loading = false,
  onClick, 
  children, 
  type = 'button'
}) => {
  const isDisabled = disabled || loading;
  
  const getButtonClasses = () => {
    const classes = ['btn'];
    
    switch (variant) {
      case 'secondary':
        classes.push('btn-secondary');
        break;
      case 'success':
        classes.push('btn-success');
        break;
      case 'primary':
      default:
        classes.push('btn-primary');
        break;
    }
    
    return classes.join(' ');
  };

  return (
    <button
      type={type}
      className={getButtonClasses()}
      onClick={onClick}
      disabled={isDisabled}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
};

// 表单字段组件
interface FormFieldProps {
  label: string;
  type: 'text' | 'password' | 'email' | 'textarea';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({ 
  label, 
  type, 
  value, 
  onChange, 
  placeholder, 
  error, 
  disabled = false 
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const getInputClasses = () => {
    const classes = ['form-input'];
    if (error) classes.push('form-input-error');
    if (type === 'textarea') classes.push('form-textarea');
    return classes.join(' ');
  };

  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={getInputClasses()}
          disabled={disabled}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={getInputClasses()}
          disabled={disabled}
        />
      )}
      {error && (
        <span className="form-error-text">{error}</span>
      )}
    </div>
  );
};

// Spinner组件
interface SpinnerProps {
  size?: number;
  color?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 24, color = '#3b82f6' }) => {
  return (
    <div 
      className="spinner"
      style={{
        '--spinner-size': `${size}px`,
        '--spinner-color': color,
        '--spinner-bg-color': `${color}20`,
      } as React.CSSProperties}
    />
  );
};

// 错误显示组件
interface ErrorDisplayProps {
  message: string;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message }) => {
  return (
    <div className="error-display">
      <span className="form-error-text">⚠️ {message}</span>
    </div>
  );
};
