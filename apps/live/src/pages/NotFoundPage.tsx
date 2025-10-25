import React from 'react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="notFoundPage">
      <h1>404 - Page Not Found</h1>
      <p>The live event you're looking for doesn't exist.</p>
      <a href="/live">Go back to Live Events</a>
    </div>
  );
};
