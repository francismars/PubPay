import React from 'react';

export const NoteSkeleton: React.FC = () => {
  return (
    <div className="paynote skeleton-loader">
      <div className="noteProfileImg">
        <div className="skeleton skeleton-avatar"></div>
      </div>
      <div className="noteData">
        <div className="noteHeader">
          <div className="noteAuthor">
            <div className="noteDisplayName">
              <div className="skeleton skeleton-text short" style={{ display: 'inline-block', width: '120px', height: '16px' }}></div>
            </div>
            <div className="noteNIP05 label">
              <div className="skeleton skeleton-text tiny" style={{ display: 'inline-block', width: '100px', height: '8px', marginTop: '0' }}></div>
            </div>
            <div className="noteLNAddress label">
              <div className="skeleton skeleton-text tiny" style={{ display: 'inline-block', width: '120px', height: '8px', marginTop: '0' }}></div>
            </div>
          </div>
          <div className="noteDate label">
            <div className="skeleton skeleton-text tiny"></div>
          </div>
        </div>
        <div className="noteContent">
          <div className="skeleton skeleton-text long" style={{ marginBottom: '8px' }}></div>
          <div className="skeleton skeleton-text long" style={{ marginBottom: '8px' }}></div>
          <div className="skeleton skeleton-text medium"></div>
        </div>
        <div className="noteValues">
          <div className="zapMinContainer">
            <div className="zapMin">
              <div className="skeleton skeleton-value"></div>
            </div>
            <div className="zapMinLabel">
              <div className="skeleton skeleton-text tiny"></div>
            </div>
          </div>
          <div className="zapMaxContainer">
            <div className="zapMax">
              <div className="skeleton skeleton-value"></div>
            </div>
            <div className="zapMaxLabel">
              <div className="skeleton skeleton-text tiny"></div>
            </div>
          </div>
          <div className="zapUsesContainer">
            <div className="zapUses">
              <div className="skeleton skeleton-value" style={{ display: 'inline-block' }}></div>
              <div className="skeleton skeleton-value" style={{ display: 'inline-block', marginLeft: '4px' }}></div>
            </div>
            <div className="zapUsesLabel">
              <div className="skeleton skeleton-text tiny"></div>
            </div>
          </div>
        </div>
        <div className="noteCTA">
          <div className="skeleton skeleton-button"></div>
        </div>
        <div className="noteActionsReactions">
          <div className="noteZaps noteZapReactions"></div>
          <div className="noteActions">
            <div className="skeleton skeleton-icon"></div>
            <div className="skeleton skeleton-icon"></div>
            <div className="skeleton skeleton-icon"></div>
            <div className="skeleton skeleton-icon"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
