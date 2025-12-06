import React from 'react';
import { useUIStore } from '@pubpay/shared-services';
import { COLORS, FONT_SIZES } from '../../constants';

export const ProcessingOverlay: React.FC = () => {
  const showProcessing = (useUIStore as any)(
    (s: any) => s.processingOverlay.show
  );
  const processingMessage = (useUIStore as any)(
    (s: any) => s.processingOverlay.message
  );

  return (
    <div
      className="overlayContainer"
      id="processingOverlay"
      style={{
        display: 'flex',
        visibility: showProcessing ? 'visible' : 'hidden',
        opacity: showProcessing ? 1 : 0,
        pointerEvents: showProcessing ? 'auto' : 'none'
      }}
    >
      <div className="overlayInner">
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <p
          className="label"
          style={{ fontSize: FONT_SIZES.LG, fontWeight: 'bold', color: COLORS.PRIMARY }}
        >
          {processingMessage || 'Processing payment...'}
        </p>
        <div
          className="formFieldGroup"
          style={{ justifyContent: 'center', padding: '24px' }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '48px',
              animation: 'spin 1.2s linear infinite'
            }}
          >
            progress_activity
          </span>
        </div>
      </div>
    </div>
  );
};

