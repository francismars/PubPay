import React from 'react';
import { GenericQR } from '@pubpay/shared-ui';
import { COLORS, FONT_SIZES } from '../../constants';

interface ProfileQRModalProps {
  show: boolean;
  data: string;
  type: 'npub' | 'lightning';
  onClose: () => void;
  onCopy: (text: string, label: string, event: React.MouseEvent) => void;
}

export const ProfileQRModal: React.FC<ProfileQRModalProps> = ({
  show,
  data,
  type,
  onClose,
  onCopy
}) => {
  if (!show) return null;

  return (
    <div className="overlayContainer" onClick={onClose}>
      <div
        className="overlayInner"
        style={{ textAlign: 'center', maxWidth: '400px' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px 0', color: COLORS.TEXT_PRIMARY }}>
          {type === 'npub'
            ? 'User ID QR Code'
            : 'Lightning Address QR Code'}
        </h3>

        <div className="profileQRContainer">
          {data ? (
            <GenericQR
              data={data}
              width={200}
              height={200}
              id="npubQR"
            />
          ) : (
            <div
              style={{
                fontSize: FONT_SIZES.SM,
                color: COLORS.TEXT_LIGHT,
                textAlign: 'center'
              }}
            >
              No data to display
            </div>
          )}
        </div>

        <p
          style={{ margin: '0 0 16px 0', color: COLORS.TEXT_LIGHT, fontSize: FONT_SIZES.SM }}
        >
          <code
            style={{
              fontSize: FONT_SIZES.XS,
              wordBreak: 'break-all',
              backgroundColor: '#f0f0f0',
              padding: '4px 8px',
              borderRadius: '4px',
              display: 'inline-block'
            }}
          >
            {data}
          </code>
        </p>

        <p
          style={{ margin: '0 0 16px 0', color: COLORS.TEXT_LIGHT, fontSize: FONT_SIZES.SM }}
        >
          {type === 'npub'
            ? 'Scan this QR code with a Nostr client to add this user'
            : 'Scan this QR code with a Lightning wallet to send payment'}
        </p>
        <div
          style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}
        >
          <button
            className="profileCopyButton"
            onClick={e => {
              onCopy(
                data,
                type === 'npub' ? 'Public Key' : 'Lightning Address',
                e
              );
            }}
            style={{ margin: 0, background: COLORS.PRIMARY, color: COLORS.TEXT_WHITE }}
          >
            Copy {type === 'npub' ? 'npub' : 'address'}
          </button>
          <button
            className="profileCopyButton"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

