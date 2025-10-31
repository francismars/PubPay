import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { LivePage } from './pages/LivePage';
import { RoomViewerPage } from './pages/RoomViewerPage';
import { RoomAdminPage } from './pages/RoomAdminPage';
import { RoomCreatePage } from './pages/RoomCreatePage';
import { MultiLoginPage } from './pages/MultiLoginPage';
import { PretalxDiagnosePage } from './pages/PretalxDiagnosePage';
import { NotFoundPage } from './pages/NotFoundPage';

export const LiveApp: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<LivePage />} />
      <Route path="/:eventId" element={<LivePage />} />
      <Route path="/multi" element={<MultiLoginPage />} />
      <Route path="/multi/create" element={<RoomCreatePage />} />
      <Route path="/pretalx/diagnose" element={<PretalxDiagnosePage />} />
      <Route path="/room/:roomId" element={<RoomViewerPage />} />
      <Route path="/room/:roomId/admin" element={<RoomAdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
