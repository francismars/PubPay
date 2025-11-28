import React, { Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';

// Lazy load pages to reduce initial bundle size
const FeedsPage = lazy(() => import('./pages/FeedsPage').then(m => ({ default: m.FeedsPage })));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const EditProfilePage = lazy(() => import('./pages/EditProfilePage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

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

// Simple loading fallback with dark mode support
const LoadingFallback: React.FC = () => {
  // Initialize dark mode on mount
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }, []);

  return (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '18px',
      color: 'var(--text-secondary)',
      backgroundColor: 'var(--bg-primary)',
      transition: 'background-color 0.3s ease, color 0.3s ease'
  }}>
    Loading...
  </div>
);
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<FeedsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/:pubkey" element={<ProfilePage />} />
            <Route path="edit-profile" element={<EditProfilePage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="note/:noteId" element={<FeedsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

// Register Service Worker for PWA with update handling
// Works on HTTPS (production) and localhost (development)
if ('serviceWorker' in navigator) {
  const isLocalhost = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';
  const isSecure = window.location.protocol === 'https:' || isLocalhost;

  if (isSecure) {
    let registration: ServiceWorkerRegistration | null = null;

    // Lightweight update check - browser also checks automatically on navigation
    const checkForUpdates = () => {
      if (registration) {
        registration.update().catch((error) => {
          console.log('[Service Worker] Update check failed:', error);
        });
      }
    };

    // Show update notification to user
    const showUpdateNotification = () => {
      // Only show if not already showing
      if (document.getElementById('sw-update-notification')) return;

      const notification = document.createElement('div');
      notification.id = 'sw-update-notification';
      notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        max-width: 400px;
      `;

      const message = document.createElement('span');
      message.textContent = 'New version available!';

      const button = document.createElement('button');
      button.textContent = 'Reload';
      button.style.cssText = `
        background: white;
        color: #4CAF50;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `;
      button.onclick = () => {
        window.location.reload();
      };

      notification.appendChild(message);
      notification.appendChild(button);
      document.body.appendChild(notification);

      // Auto-hide after 10 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.style.opacity = '0';
          notification.style.transition = 'opacity 0.3s';
          setTimeout(() => notification.remove(), 300);
        }
      }, 10000);
    };

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((reg) => {
          registration = reg;
          console.log('[Service Worker] Registered successfully:', reg.scope);

          // Listen for new service worker - this fires automatically when browser detects file change
          let refreshing = false;
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && reg.active) {
                // New service worker is waiting
                console.log('[Service Worker] New version available');
                showUpdateNotification();
              } else if (newWorker.state === 'activated') {
                // New service worker is active (happens with skipWaiting())
                if (!refreshing) {
                  console.log('[Service Worker] New version activated, reloading...');
                  window.location.reload();
                  refreshing = true;
                }
              }
            });
          });

          // Check for updates once on load (browser also checks automatically on navigation)
          // No need for aggressive polling - browser handles this efficiently
          checkForUpdates();
        })
        .catch((error) => {
          console.log('[Service Worker] Registration failed:', error);
        });
    });
  }
}
