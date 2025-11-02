import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { FeedsPage } from './pages/FeedsPage';
import AboutPage from './pages/AboutPage';
import ProfilePage from './pages/ProfilePage';
import EditProfilePage from './pages/EditProfilePage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';

// Import CSS
import './styles/pubpay.css';

// Import images so webpack bundles them
import './assets/images/generic-user-icon.svg';
import './assets/images/gradient_color.gif';
import './assets/images/powered_by_white_bg.png';
import './assets/images/powered_by.png';

// Import favicon and app icons
import './assets/images/icon/favicon-16x16.png';
import './assets/images/icon/favicon-32x32.png';
import './assets/images/icon/favicon-96x96.png';
import './assets/images/icon/favicon.ico';
import './assets/images/icon/apple-icon.png';
import './assets/images/icon/apple-icon-57x57.png';
import './assets/images/icon/apple-icon-60x60.png';
import './assets/images/icon/apple-icon-72x72.png';
import './assets/images/icon/apple-icon-76x76.png';
import './assets/images/icon/apple-icon-114x114.png';
import './assets/images/icon/apple-icon-120x120.png';
import './assets/images/icon/apple-icon-144x144.png';
import './assets/images/icon/apple-icon-152x152.png';
import './assets/images/icon/apple-icon-180x180.png';
import './assets/images/icon/android-icon-36x36.png';
import './assets/images/icon/android-icon-48x48.png';
import './assets/images/icon/android-icon-72x72.png';
import './assets/images/icon/android-icon-96x96.png';
import './assets/images/icon/android-icon-144x144.png';
import './assets/images/icon/android-icon-192x192.png';
import './assets/images/icon/ms-icon-70x70.png';
import './assets/images/icon/ms-icon-144x144.png';
import './assets/images/icon/ms-icon-150x150.png';
import './assets/images/icon/ms-icon-310x310.png';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<FeedsPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/:pubkey" element={<ProfilePage />} />
          <Route path="edit-profile" element={<EditProfilePage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="note/:noteId" element={<FeedsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

// Register Service Worker for PWA
// Works on HTTPS (production) and localhost (development)
if ('serviceWorker' in navigator) {
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
  const isSecure = window.location.protocol === 'https:' || isLocalhost;
  
  if (isSecure) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('[Service Worker] Registered successfully:', registration.scope);
          
          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60000); // Check every minute
        })
        .catch((error) => {
          console.log('[Service Worker] Registration failed:', error);
        });
    });
  }
}
