// 404 Not Found page component
import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="overlayContainer" style={{ display: 'block' }}>
      <div className="overlayInner">
        <div className="brand">
          PUB<span style={{ color: '#cecece' }}>PAY</span>
          <span style={{ color: '#00000014' }}>.me</span>
        </div>
        <h2>404 - Page Not Found</h2>
        <p>The page you're looking for doesn't exist.</p>

        <div style={{ marginTop: '2rem' }}>
          <Link to="/" className="cta" style={{ marginRight: '1rem' }}>
            Go Home
          </Link>
          <Link to="/live" className="cta" style={{ marginRight: '1rem' }}>
            Live Display
          </Link>
          <Link to="/jukebox" className="cta">
            Jukebox
          </Link>
        </div>
      </div>
    </div>
  );
};
