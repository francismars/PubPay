import React from 'react';
import { COLORS, FONT_SIZES } from '../../constants';

interface SignerPasteOverlayProps {
  isVisible: boolean;
  onPaste: () => void;
  onCancel: () => void;
}

export const SignerPasteOverlay: React.FC<SignerPasteOverlayProps> = ({
  isVisible,
  onPaste,
  onCancel
}) => {
  return (
    <div
      className="overlayContainer"
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
      onClick={onCancel}
    >
      <div
        className="overlayInner"
        onClick={e => e.stopPropagation()}
        style={{ transform: 'none', animation: 'none', maxWidth: 340 }}
      >
        <p
          className="label"
          style={{
            fontSize: FONT_SIZES.LG,
            fontWeight: 'bold',
            color: COLORS.TEXT_PRIMARY,
            marginBottom: 8,
            textAlign: 'center'
          }}
        >
          Complete Sign-in
        </p>

        <p
          className="label"
          style={{
            fontSize: FONT_SIZES.SM,
            color: COLORS.TEXT_SECONDARY,
            marginBottom: 24,
            lineHeight: 1.5,
            textAlign: 'center'
          }}
        >
          Your signer app copied your public key to the clipboard. Tap the
          button below to finish signing in.
        </p>

        <div
          className="formFieldGroup"
          style={{ justifyContent: 'center', gap: 12 }}
        >
          <a
            href="#"
            className="cta"
            onClick={e => {
              e.preventDefault();
              onPaste();
            }}
          >
            Paste from Signer
          </a>
        </div>

        <a
          href="#"
          className="label"
          style={{ marginTop: 16, color: COLORS.TEXT_SECONDARY, textAlign: 'center', display: 'block' }}
          onClick={e => {
            e.preventDefault();
            onCancel();
          }}
        >
          cancel
        </a>
      </div>
    </div>
  );
};
