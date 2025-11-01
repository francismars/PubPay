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
      {/* Explicit /live/ routes - clearer and prevents "live" from being captured as eventId */}
      <Route path="/live/" element={<LivePage />} />
      <Route path="/live/:eventId" element={<LivePage />} />
      
      {/* Multi LIVE routes */}
      <Route path="/live/multi" element={<MultiLoginPage />} />
      <Route path="/live/multi/create" element={<RoomCreatePage />} />
      <Route path="/live/pretalx/diagnose" element={<PretalxDiagnosePage />} />
      <Route path="/live/multi/:roomId" element={<RoomViewerPage />} />
      <Route path="/live/multi/:roomId/admin" element={<RoomAdminPage />} />
      
      {/* Catch-all for anything else */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
