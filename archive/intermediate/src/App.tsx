// Main App component with React Router
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { LivePage } from '@/pages/LivePage';
import { JukeboxPage } from '@/pages/JukeboxPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/live" element={<LivePage />} />
      <Route path="/live/:eventId" element={<LivePage />} />
      <Route path="/jukebox" element={<JukeboxPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
};

export default App;
