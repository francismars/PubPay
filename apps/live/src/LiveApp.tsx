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
      {/* Explicitly exclude "live", "multi" from being captured as eventId */}
      <Route path="/multi" element={<MultiLoginPage />} />
      <Route path="/multi/create" element={<RoomCreatePage />} />
      <Route path="/pretalx/diagnose" element={<PretalxDiagnosePage />} />
      <Route path="/multi/:roomId" element={<RoomViewerPage />} />
      <Route path="/multi/:roomId/admin" element={<RoomAdminPage />} />
      {/* Match eventId route last, after all specific routes */}
      <Route path="/:eventId" element={<LivePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
