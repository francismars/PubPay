# PubPay Migration & Refactoring – Consolidated Guide

This document supersedes: `REFACTORING_PLAN.md`, `MIGRATION_STRATEGY.md`, `CRITICAL_FILES_ANALYSIS.md`, and `ARCHITECTURE_DESIGN.md`. It merges their content and reflects the current status based on the code in `src/`, `public/`, server setup, and build configuration.

## Scope and Goals
- Modernize architecture with TypeScript, modular services and components
- Preserve existing functionality during migration
- Reduce bundle size and improve performance
- Add testing and quality gates

## Technology Stack
- Frontend: TypeScript, React, Zustand, Sass (SCSS modules), Webpack
- Services: NostrTools, LNBits (Lightning), QRious, bolt11
- Tooling: ESLint (flat config), Prettier, Husky, lint-staged, Jest, Cypress

## High-level Architecture (Target)
```
src/
├── components/    # Reusable UI components
├── features/      # Feature modules (live-display, jukebox, payments)
├── services/      # Business logic (nostr, lightning, api, storage)
├── hooks/         # Custom hooks
├── stores/        # State management (Zustand)
├── types/         # TypeScript types
├── utils/         # Utilities
└── styles/        # SCSS modules and design system
```

## Current Architecture (Legacy vs New)

### Legacy (still present)
- Static assets served from `public/` including large JS/CSS files
- Legacy pages and scripts: live display, jukebox, general app logic

```1:20:public/javascripts (directory listing)
- bolt11.min.js
- drawkind1.js
- drawkind9735.js
- index.js
- jukebox.js
- live.js
- nostrtools.min.js
- qrious.min.js
- signIn.js
- util.js
- zap.js
```

```33:53:src/index.html
<link rel="stylesheet" href="/stylesheets/style.css?v0.06">
<link rel="stylesheet" href="/fonts/Inter-4.0/inter.css">
<script src="/javascripts/nostrtools.min.js"></script>
<script src="/javascripts/bolt11.min.js"></script>
<script src="/javascripts/qrious.min.js"></script>
...
<script src="https://www.youtube.com/iframe_api"></script>
```

### New (modular TS + webpack)
- Modular `src/` with `components`, `features`, `services`, `hooks`, `stores`, `types`, `utils`
- Webpack build with SPA entry `src/index.tsx`; dev server configured

```5:28:webpack.config.js
module.exports = {
  mode: 'development',
  entry: { main: './src/index.tsx' },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].[contenthash].js', clean: true, publicPath: '/' },
  resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx'], alias: { '@': path.resolve(__dirname, 'src') } },
  ...
};
```

```1:20:src/services (directory listing)
- api/
- lightning/
- nostr/
- storage/
- AuthService.ts
- ErrorService.ts
```

## Server Integration
The Express server serves `public/` and Jade views. It does not yet serve the SPA build (`dist/`) or provide a fallback for SPA routes in production.

```29:37:app.js
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/live', liveRouter);
app.use('/jukebox', jukeboxRouter);
```

## Status Summary (Based on Current Code)
- Architecture and build tooling: COMPLETE
  - TS + webpack configured; aliases and loaders in place
  - Modular services for Nostr, Lightning, API, storage exist
  - Core components and pages exist
- Styling migration: NOT STARTED
  - `src/styles` is empty; components still rely on legacy global CSS via `src/index.html`
- Testing: NOT STARTED
  - `src/tests` empty; no Jest/Cypress configs or scripts present
- ESLint flat config: PRESENT
  - ESLint v9 flat config exists and targets `src/**/*.{ts,tsx}`
- Legacy assets: STILL IN USE
  - `src/index.html` loads legacy scripts and CSS from `public/`
  - Webpack dev server serves `public/`, masking missing migrations
- SPA production serving: NOT WIRED
  - Express does not serve `dist/` nor SPA fallback

## Consolidated Plan (Updated)

### Phase 1 — Foundation & Structure: COMPLETE
- Project structure in `src/` established
- Webpack, TS, ESLint, Prettier configured

### Phase 2 — Service Layer Extraction: COMPLETE
- `src/services/nostr/*` extracted
- `src/services/lightning/*` extracted
- `src/services/api/*` extracted
- `src/services/storage/*` extracted

### Phase 3 — Component/Feature Extraction: COMPLETE
- Core UI components exist (`QRCodeComponent`, `LiveEventDisplayComponent`, `LightningPaymentComponent`, layout)
- Features/pages exist (`HomePage`, `LivePage`, `JukeboxPage`)

### Phase 4 — State Management: COMPLETE
- Stores in `src/stores` implemented
- Hooks in `src/hooks` present

### Phase 5 — Styling Migration: PENDING
- Create SCSS module system (`src/styles/common/*`)
- Migrate component styles from `public/stylesheets/style.css`
- Replace global CSS link in `src/index.html` with modular imports

### Phase 6 — Testing & Quality: PENDING
- Add Jest + Testing Library for unit/component tests
- Add Cypress for E2E
- Add initial smoke tests for services (`NostrClient`, `LightningService`) and a basic component

### Phase 7 — Integration & Cleanup: PARTIAL
- Wire Express to serve `dist/` with SPA fallback (production)
- Remove legacy script/style tags from `src/index.html`
- After parity verification, remove legacy `public/javascripts/*.js` and unused CSS

### Phase 8 — Performance & Polish: PENDING
- Code splitting on feature boundaries (verify in app)
- Asset strategy (fonts/images hashing or explicit `public/` policy)
- Image optimization and caching strategy

## Testing Strategy
- Unit Tests (Jest): utils, services, hooks
- Component Tests (Testing Library): core UI components
- Integration Tests: feature workflows and service integration
- E2E (Cypress): critical user journeys (payments, live display, jukebox)

## Recent Fixes Applied

- **Zap Menu Structure**: Fixed missing zap menu dropdown in `PayNoteComponent.tsx` to match original HTML structure with proper IDs and click-outside functionality.
- **View Raw Functionality**: Fixed `handleViewRaw` in `HomePage.tsx` to properly populate the JSON viewer with the original event data (`post.event`) when "View Raw" is clicked, matching the original `showJSON(eventData)` behavior.
- **Pay Anonymously Button**: Added missing `handlePayAnonymously` function and onClick handler for the "Pay Anonymously" button in the dropdown menu to use the current zap amount from the slider.
- **Lightning Overlay Buttons**: Fixed "Pay with Extension", "Pay with Wallet", and "Copy Invoice" buttons in the Lightning payment overlay to match original behavior:
  - **Copy Invoice**: Changes button text to "Copied!" for 1 second, then back to "Copy Invoice" (no alerts)
  - **Pay with Wallet**: Uses `window.location.href = lightning:${invoice}` to open Lightning wallet
  - **Pay with Extension**: Shows appropriate feedback for extension integration

## Recent Major Implementation

- **Complete Lightning Payment Flow**: Implemented full zap payment functionality:
  1. ✅ Created `ZapService` with `getInvoiceCallBack`, `createZapEvent`, and `signZapEvent` methods
  2. ✅ Updated `handlePayWithExtension` to use the new ZapService for complete payment flow
  3. ✅ Added QR code generation and payment interface display
  4. ✅ Integrated with existing Lightning address (LUD16) system
  5. ✅ Added proper error handling and user feedback

The main "Pay" button now works end-to-end: gets Lightning callback → creates zap event → signs with user's key → shows QR code for payment.

## Detailed To‑Do (Actionable)

1) Styling migration
- Create `src/styles/common/{variables.scss,mixins.scss,reset.scss,typography.scss}`
- Introduce at least one SCSS module and migrate a component (e.g., live display)
- Remove `<link href="/stylesheets/style.css">` from `src/index.html`

2) Remove legacy globals
- Replace legacy global scripts with TS imports where used: `nostr-tools`, `bolt11`, `qrious`
- If YouTube IFrame API is required, lazy-load it within the relevant module

3) Testing setup
- Add `jest.config.js`, Testing Library, and sample unit tests
- Add Cypress config and a smoke E2E that loads the Home and Live pages
- Add npm scripts: `test`, `test:integration`, `test:e2e`

4) Express production serving
- Serve `dist/` statics and add SPA history fallback to `dist/index.html`
- Keep `public/` for only truly static assets (icons, fonts) or move to bundling via webpack

5) Feature parity verification
- Validate new `LivePage` and `JukeboxPage` flows against legacy behavior
- Once validated, delete `public/javascripts/{live.js,jukebox.js,index.js}` and related CSS blocks

6) Performance
- Audit bundle; split heavy modules and lazy-load feature routes
- Introduce asset hashing strategy for images/fonts (via webpack) or define cache headers in Express

## Progress Checklists

### Architecture & Services
- [x] TS + webpack build
- [x] Services extracted: Nostr, Lightning, API, storage
- [x] Pages and core components
- [x] State stores and hooks

### Styling
- [ ] SCSS base (`src/styles/common/*`)
- [ ] Component SCSS modules
- [ ] Remove legacy CSS link from SPA HTML

### Testing & Quality
- [ ] Jest + Testing Library configured
- [ ] Cypress configured
- [ ] Initial unit tests for services
- [ ] Component test for a key component

### Integration & Cleanup
- [ ] Express serves `dist/` with SPA fallback
- [ ] Remove legacy script tags from SPA HTML
- [ ] Remove legacy JS after parity is verified

### Performance
- [x] Webpack splitChunks configured
- [ ] Route-level code splitting verified in app routing
- [ ] Asset strategy defined (hashing/caching)

## Notes and Risks
- Visual regressions possible during CSS migration; plan incremental rollouts
- Legacy globals can hide missing imports; remove them early after verifying replacements
- Ensure Lightning/Nostr flows are covered by integration tests prior to removing legacy code

## Migration Checklist

### Pre-Migration
- [ ] Backup current codebase
- [ ] Create feature branch
- [ ] Review consolidated plan with team

### During Migration
- [ ] Test each phase thoroughly
- [ ] Maintain backward compatibility (routes/APIs)
- [ ] Document changes
- [ ] Collect user feedback

### Post-Migration
- [ ] Performance testing
- [ ] User acceptance testing
- [ ] Documentation update
- [ ] Team training

## Rollback Strategy

### Phase-Level Rollback
1. Phase 1: Revert build system configuration
2. Phase 2: Revert service extractions
3. Phase 3: Revert component/feature extractions
4. Phase 4: Revert state management changes
5. Phase 5: Revert styling migration
6. Phase 6: Revert testing harness changes

### Emergency Rollback
```
git checkout main
git reset --hard HEAD~1
npm install
npm start
```

## Success Metrics

### Code Quality
- [ ] 0 ESLint errors
- [ ] ≥90% test coverage (unit+integration)
- [ ] No files over 500 lines except index.html

### Performance
- [ ] <3s initial load time
- [ ] <100ms interaction response
- [ ] ≥70% bundle size reduction vs legacy
- [ ] 90+ Lighthouse score

### Maintainability
- [ ] Clear separation of concerns
- [ ] Reusable components
- [ ] Comprehensive documentation
- [ ] Easy to add new features

## Appendix — References

ESLint flat config exists and targets TS files:
```5:19:eslint.config.js
export default [
  js.configs.recommended,
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { parser: typescriptParser, parserOptions: { project: './tsconfig.json' } }, plugins: { '@typescript-eslint': typescript }, rules: { '@typescript-eslint/no-unused-vars': 'warn' } },
  { ignores: ['dist/','node_modules/','public/','*.js','webpack.config.js','eslint.config.js'] }
];
```

SPA entry point:
```1:20:src/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```


