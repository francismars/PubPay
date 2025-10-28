import React, { useState } from 'react';

interface NewPayNoteOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (formData: Record<string, string>) => Promise<void>;
  isPublishing?: boolean;
}

export const NewPayNoteOverlay: React.FC<NewPayNoteOverlayProps> = ({
  isVisible,
  onClose,
  onSubmit,
  isPublishing = false
}) => {
  const [paymentType, setPaymentType] = useState<'fixed' | 'range'>('fixed');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      data[key] = value.toString();
    }

    try {
      await onSubmit(data);
      onClose();
      setPaymentType('fixed'); // Reset to default
    } catch (error) {
      console.error('Failed to post note:', error);
    }
  };

  return (
    <div
      className="overlayContainer"
      id="newPayNoteForm"
      style={{ display: isVisible ? 'flex' : 'none' }}
    >
      <div className="overlayInner">
        <div className="brand">
          PUB<span style={{ color: '#cecece' }}>PAY</span>
          <span style={{ color: '#00000014' }}>.me</span>
        </div>
        <form id="newKind1" onSubmit={handleSubmit}>
          <div className="formField">
            <label htmlFor="payNoteContent" className="label">
              Your Payment Request
            </label>
            <textarea
              id="payNoteContent"
              name="payNoteContent"
              rows={4}
              placeholder="Payment Request Description"
            ></textarea>
          </div>

          <fieldset className="formField formSelector">
            <legend className="uppercase">Select type</legend>
            <div>
              <input
                type="radio"
                id="fixedFlow"
                name="paymentType"
                value="fixed"
                checked={paymentType === 'fixed'}
                onChange={e => {
                  if (e.target.checked) setPaymentType('fixed');
                }}
              />
              <label htmlFor="fixedFlow">Fixed</label>
            </div>
            <div>
              <input
                type="radio"
                id="rangeFlow"
                name="paymentType"
                value="range"
                checked={paymentType === 'range'}
                onChange={e => {
                  if (e.target.checked) setPaymentType('range');
                }}
              />
              <label htmlFor="rangeFlow">Range</label>
            </div>
            <div className="disabled">
              <input
                type="radio"
                id="targetFlow"
                name="paymentType"
                value="target"
                disabled
              />
              <label htmlFor="targetFlow">Target</label>
            </div>
          </fieldset>

          <div
            className="formFieldGroup"
            id="fixedInterface"
            style={{ display: paymentType === 'fixed' ? 'block' : 'none' }}
          >
            <div className="formField">
              <label htmlFor="zapFixed" className="label">
                Fixed Amount*{' '}
                <span className="tagName">zap-min = zap-max</span>
              </label>
              <input
                type="number"
                min={1}
                id="zapFixed"
                placeholder="1"
                name="zapFixed"
                required={paymentType === 'fixed'}
              />
            </div>
          </div>

          <div
            className="formFieldGroup"
            id="rangeInterface"
            style={{ display: paymentType === 'range' ? 'flex' : 'none' }}
          >
            <div className="formField">
              <label htmlFor="zapMin" className="label">
                Minimum* <span className="tagName">zap-min</span>
              </label>
              <input
                type="number"
                min={1}
                id="zapMin"
                placeholder="1"
                name="zapMin"
                required={paymentType === 'range'}
              />
            </div>
            <div className="formField">
              <label htmlFor="zapMax" className="label">
                Maximum* <span className="tagName">zap-max</span>
              </label>
              <input
                type="number"
                min={1}
                id="zapMax"
                placeholder="1000000000"
                name="zapMax"
                required={paymentType === 'range'}
              />
            </div>
          </div>

          <details className="formField">
            <summary className="legend summaryOptions">
              Advanced Options
            </summary>

            <div className="formFieldGroup">
              <div className="formField">
                <label htmlFor="zapUses" className="label">
                  Uses <span className="tagName">zap-uses</span>
                </label>
                <input
                  type="number"
                  min={1}
                  id="zapUses"
                  placeholder="1"
                  name="zapUses"
                />
              </div>
              <div className="formField disabled">
                <label htmlFor="zapIncrement" className="label">
                  Increment <span className="tagName"></span>
                </label>
                <input
                  type="text"
                  id="zapIncrement"
                  placeholder="0"
                  name="zapIncrement"
                  disabled
                />
              </div>
            </div>

            <div className="formField">
              <label htmlFor="zapPayer" className="label">
                Payer <span className="tagName">zap-payer</span>
              </label>
              <input
                type="text"
                id="zapPayer"
                placeholder="npub1..."
                name="zapPayer"
              />
            </div>

            <div className="formField">
              <label htmlFor="overrideLNURL" className="label">
                Override receiving address
                <span className="tagName"> zap-lnurl</span>
              </label>
              <input
                type="email"
                id="overrideLNURL"
                placeholder="address@lnprovider.net"
                name="overrideLNURL"
              />
            </div>

            <div className="formField disabled">
              <label htmlFor="redirectToNote" className="label">
                Redirect payment to note{' '}
                <span className="tagName">zap-redirect</span>{' '}
              </label>
              <input
                type="text"
                id="redirectToNote"
                placeholder="note1..."
                name="redirectToNote"
                disabled
              />
            </div>
          </details>
          <button type="submit" id="postNote" className="cta">
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        </form>
        <a
          id="cancelNewNote"
          href="#"
          className="label"
          onClick={onClose}
        >
          cancel
        </a>
      </div>
    </div>
  );
};
