import React from 'react';
import { useUIStore } from '@pubpay/shared-services';

interface StatusToastProps {
  // Component reads directly from useUIStore, no props needed
}

export const StatusToast: React.FC<StatusToastProps> = () => {
  const statusToast = (useUIStore as any)((s: any) => s.statusToast);
  const closeToast = (useUIStore as any)((s: any) => s.closeToast);

  if (!statusToast?.show) {
    return null;
  }

  return (
    <div className="statusToast" role="status" aria-live="polite">
      <span
        className={`material-symbols-outlined statusToastIcon statusToast-${statusToast.variant}`}
      >
        {statusToast.variant === 'success'
          ? 'check_circle'
          : statusToast.variant === 'error'
            ? 'error'
            : 'progress_activity'}
      </span>
      <div className="statusToastMessage">{statusToast.message}</div>
      <button
        onClick={() => closeToast()}
        className="statusToastClose"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
};

