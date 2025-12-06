import React, { useState } from 'react';
import { TOAST_DURATION } from '../../constants';

interface PasswordPromptOverlayProps {
  isVisible: boolean;
  onSubmit: (password: string) => Promise<void>;
  onLogout: () => void;
}

export const PasswordPromptOverlay: React.FC<PasswordPromptOverlayProps> = ({
  isVisible,
  onSubmit,
  onLogout
}) => {
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      // Show validation message
      try {
        const { useUIStore } = await import('@pubpay/shared-services');
        useUIStore.getState().openToast('Please enter your password', 'error', false);
        setTimeout(() => {
          try {
            useUIStore.getState().closeToast();
          } catch {
            // Ignore toast errors
          }
        }, TOAST_DURATION.SHORT);
      } catch (toastError) {
        console.warn('Failed to show toast:', toastError);
      }
      return;
    }

    try {
      await onSubmit(password);
      setPassword('');
    } catch (error) {
      console.error('Password prompt failed:', error);
      // Extract user-friendly error message
      const errorMessage = error instanceof Error
        ? (error.message.includes('incorrect') || error.message.includes('password')
            ? error.message
            : 'Incorrect password. Please check your password and try again.')
        : 'Incorrect password. Please check your password and try again.';

      try {
        const { useUIStore } = await import('@pubpay/shared-services');
        useUIStore.getState().openToast(errorMessage, 'error', false);
        setTimeout(() => {
          try {
            useUIStore.getState().closeToast();
          } catch (toastError) {
            console.warn('Failed to close toast:', toastError);
          }
        }, TOAST_DURATION.LONG);
      } catch (toastError) {
        console.warn('Failed to show toast:', toastError);
      }
      setPassword('');
    }
  };

  const handleLogout = () => {
    setPassword('');
    onLogout();
  };

  return (
    <div
      className="overlayContainer"
      id="passwordPromptOverlay"
      style={{
        display: 'flex',
        visibility: isVisible ? 'visible' : 'hidden',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'none',
        transition: 'none'
      }}
      onClick={() => {
        // Don't close on outside click - password is required
      }}
    >
      <div
        className="overlayInner"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '400px',
          width: '90%',
          transform: 'none',
          animation: 'none'
        }}
      >
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text-primary)' }}>
          Enter Password
        </h3>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            margin: '0 0 24px 0'
          }}
        >
          Your private key is encrypted with a password. Please enter it to continue.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            id="passwordPromptInput"
            placeholder="Enter your password"
            className="inputField"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
            style={{
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              border: '2px solid var(--border-color)',
              borderRadius: '6px',
              padding: '12px 16px',
              width: '100%',
              fontSize: '14px',
              boxSizing: 'border-box',
              marginBottom: '16px'
            }}
          />
          <button
            type="submit"
            className="cta"
            style={{ width: '100%', marginBottom: '12px' }}
          >
            Unlock
          </button>
        </form>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <a
            href="#"
            className="label"
            onClick={(e) => {
              e.preventDefault();
              handleLogout();
            }}
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'underline',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Logout
          </a>
        </div>
      </div>
    </div>
  );
};

