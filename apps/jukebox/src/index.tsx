import React from 'react';
import { createRoot } from 'react-dom/client';
import { JukeboxPage } from './pages/JukeboxPage';
import './styles/jukebox.css';

// Import images so webpack bundles them
import './assets/images/lightning.gif';
import './assets/images/gradient_color.gif';
import './assets/images/powered_by_white_bg.png';

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

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<JukeboxPage />);
