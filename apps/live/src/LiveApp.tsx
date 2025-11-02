import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

// Lazy load all pages to reduce initial bundle size
// Each page will be loaded on-demand when the route is accessed
const LivePage = lazy(() => import('./pages/LivePage').then(m => ({ default: m.LivePage })));
const RoomViewerPage = lazy(() => import('./pages/RoomViewerPage').then(m => ({ default: m.RoomViewerPage })));
const RoomAdminPage = lazy(() => import('./pages/RoomAdminPage').then(m => ({ default: m.RoomAdminPage })));
const RoomCreatePage = lazy(() => import('./pages/RoomCreatePage').then(m => ({ default: m.RoomCreatePage })));
const MultiLoginPage = lazy(() => import('./pages/MultiLoginPage').then(m => ({ default: m.MultiLoginPage })));
const PretalxDiagnosePage = lazy(() => import('./pages/PretalxDiagnosePage').then(m => ({ default: m.PretalxDiagnosePage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// Simple loading fallback
const LoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '18px',
    color: '#666'
  }}>
    Loading...
  </div>
);

export const LiveApp: React.FC = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Explicit /live/ routes - clearer and prevents "live" from being captured as eventId */}
        <Route path="/live/" element={<LivePage />} />
        <Route path="/live/:eventId" element={<LivePage />} />

        {/* Multi LIVE routes - lazy loaded */}
        <Route path="/live/multi" element={<MultiLoginPage />} />
        <Route path="/live/multi/create" element={<RoomCreatePage />} />
        <Route path="/live/pretalx/diagnose" element={<PretalxDiagnosePage />} />
        <Route path="/live/multi/:roomId" element={<RoomViewerPage />} />
        <Route path="/live/multi/:roomId/admin" element={<RoomAdminPage />} />

        {/* Catch-all for anything else */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};
