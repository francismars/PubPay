import React, { useEffect } from 'react';

export const NotFoundPage: React.FC = () => {
  // Initialize dark mode on mount (since this page is outside Layout)
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }, []);

  return (
    <div className="notFoundPage">
      <div className="notFoundContent">
        <div className="brand">
          <span className="logoPub">PUB</span>
          <span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <div className="errorCode">404</div>
        <h1>Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/" className="cta">
          Return to PubPay
        </a>
      </div>
    </div>
  );
};

