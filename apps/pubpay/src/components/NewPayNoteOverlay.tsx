import React, { useState, useRef } from 'react';
import { BlossomService } from '@pubpay/shared-services';
import { formatContent } from '../utils/contentFormatter';

interface NewPayNoteOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (formData: Record<string, string>) => Promise<void>;
  isPublishing?: boolean;
  nostrClient?: any;
}

export const NewPayNoteOverlay: React.FC<NewPayNoteOverlayProps> = ({
  isVisible,
  onClose,
  onSubmit,
  isPublishing = false,
  nostrClient
}) => {
  const [paymentType, setPaymentType] = useState<'fixed' | 'range'>('fixed');
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blossomService = new BlossomService();

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

  // Handle image upload
  const handleImageUpload = async (file: File) => {
    if (!blossomService.isAuthenticated()) {
      alert('Please sign in to upload images');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    setIsUploading(true);
    try {
      const hash = await blossomService.uploadImageFromClipboard(file);
      const imageUrl = blossomService.getFileUrl(hash);
      
      // Insert image URL at cursor position in textarea
      insertTextAtCursor(`\n${imageUrl}\n`);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Insert text at cursor position
  const insertTextAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    
    textarea.value = value.slice(0, start) + text + value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  };

  // Handle paste event
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste
        
        const file = item.getAsFile();
        if (file) {
          await handleImageUpload(file);
        }
        break;
      }
    }
  };

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleImageUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Update preview when textarea content changes
  const handleTextareaChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value;
    
    // Clear previous timeout
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }
    
    // Debounce the formatting to avoid excessive calls
    previewTimeoutRef.current = setTimeout(async () => {
      const formatted = await formatContent(content, nostrClient);
      setPreviewContent(formatted);
    }, 300);
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
              ref={textareaRef}
              id="payNoteContent"
              name="payNoteContent"
              rows={4}
              placeholder="Payment Request Description"
              onPaste={handlePaste}
              onChange={handleTextareaChange}
              disabled={isUploading}
            ></textarea>
            
            {/* Button row below textarea */}
            <div className="payNoteContentButtons">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
              >
                {showPreview ? 'Hide Preview' : 'Preview'}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  cursor: isUploading ? 'wait' : 'pointer',
                  backgroundColor: isUploading ? '#ccc' : '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isUploading ? 'Uploading' : 'Upload'}
              </button>
            </div>
            
            {/* Preview Panel */}
            {showPreview && previewContent && (
              <div style={{
                marginTop: '12px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                minHeight: '100px',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                <div style={{
                  fontSize: '13px',
                  color: '#6b7280',
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  Preview:
                </div>
                <div
                  style={{
                    fontSize: '15px',
                    lineHeight: '1.5',
                    color: '#111827'
                  }}
                  dangerouslySetInnerHTML={{ __html: previewContent }}
                />
              </div>
            )}
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
