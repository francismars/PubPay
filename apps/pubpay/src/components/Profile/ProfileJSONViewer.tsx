import React from 'react';

interface ProfileJSONViewerProps {
  show: boolean;
  content: string;
  onClose: () => void;
}

export const ProfileJSONViewer: React.FC<ProfileJSONViewerProps> = ({
  show,
  content,
  onClose
}) => {
  return (
    <div
      className="overlayContainer"
      id="viewJSON"
      style={{
        display: 'flex',
        visibility: show ? 'visible' : 'hidden',
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none'
      }}
      onClick={onClose}
    >
      <div className="overlayInner" onClick={e => e.stopPropagation()}>
        <pre id="noteJSON">{content}</pre>
        <a
          id="closeJSON"
          href="#"
          className="label"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          close
        </a>
      </div>
    </div>
  );
};

