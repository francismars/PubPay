import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { LivePage } from './pages/LivePage';
import { NotFoundPage } from './pages/NotFoundPage';

export const LiveApp: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<LivePage />} />
      <Route path="/:eventId" element={<LivePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
