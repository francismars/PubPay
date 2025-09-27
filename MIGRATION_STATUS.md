# PubPay Migration Status & Guide

## Overview
This document tracks the migration of PubPay from a monolithic JavaScript codebase to a modern TypeScript/React architecture while preserving all existing functionality.

## Current Status: Core Functionality Complete ✅

### ✅ What's Working
- **Lightning Payment Flow**: Complete zap payment system with ZapService
- **Real-time Updates**: Live zap subscription that updates UI when new zaps arrive
- **Invoice Management**: Auto-close overlay when payment detected, QR code generation
- **User Authentication**: Extension, external signer, and nsec login methods
- **Profile Display**: Shows user display name with clickable link to nostrudel profile
- **UI Interactions**: Zap menu, view raw, pay buttons, copy invoice functionality
- **Anonymous Zaps**: Support for anonymous zap payments
- **Duplicate Prevention**: Prevents duplicate zaps from being displayed

### 🔄 Partially Working
- **Legacy Integration**: Still uses some legacy scripts from `public/` directory
- **Styling**: Uses legacy CSS, SCSS modules not yet implemented

### ❌ Not Yet Implemented
- **Testing**: No unit, integration, or E2E tests
- **Production Serving**: Express doesn't serve SPA build
- **Performance Optimization**: No code splitting or asset optimization

## Architecture

### Target Architecture
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

### Technology Stack
- **Frontend**: TypeScript, React, Zustand, Sass (SCSS modules), Webpack
- **Services**: NostrTools, LNBits (Lightning), QRious, bolt11
- **Tooling**: ESLint (flat config), Prettier, Jest, Cypress

## Recent Fixes Applied

- **Zap Menu Structure**: Fixed missing zap menu dropdown with proper IDs and click-outside functionality
- **View Raw Functionality**: Fixed JSON viewer to show original event data
- **Pay Anonymously Button**: Added missing functionality for anonymous payments
- **Lightning Overlay Buttons**: Fixed all payment overlay interactions
- **Invoice Overlay Auto-Close**: Implemented automatic closing when zap payment is detected
- **Real-time Zap Subscription**: Added live zap updates with duplicate prevention
- **Logged In Form Display**: Fixed to show display name with nostrudel profile link
- **TypeScript Compilation**: Fixed all compilation errors

## Next Steps (Priority Order)

### 1. Styling Migration (High Priority)
- [ ] Create `src/styles/common/{variables.scss,mixins.scss,reset.scss,typography.scss}`
- [ ] Migrate at least one component to SCSS modules
- [ ] Remove `<link href="/stylesheets/style.css">` from `src/index.html`

### 2. Testing Setup (High Priority)
- [ ] Add `jest.config.js` and Testing Library
- [ ] Add Cypress config for E2E tests
- [ ] Add npm scripts: `test`, `test:integration`, `test:e2e`
- [ ] Write initial tests for `NostrClient`, `LightningService`, and key components

### 3. Production Integration (Medium Priority)
- [ ] Wire Express to serve `dist/` with SPA fallback
- [ ] Remove legacy script tags from `src/index.html`
- [ ] Remove legacy JS files after parity verification

### 4. Performance Optimization (Low Priority)
- [ ] Implement code splitting on feature boundaries
- [ ] Define asset hashing strategy for images/fonts
- [ ] Optimize bundle size and loading performance

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests (when implemented)
npm run test
npm run test:e2e
```

## Success Metrics

### Code Quality
- [ ] 100% TypeScript coverage
- [ ] 90% test coverage
- [ ] 0 ESLint errors
- [ ] No files over 500 lines

### Performance
- [ ] <3s initial load time
- [ ] <100ms interaction response
- [ ] 70% bundle size reduction vs legacy
- [ ] 90+ Lighthouse score

## Risk Mitigation

### Technical Risks
- **Complex Dependencies**: Break into smaller pieces
- **State Management**: Use proven patterns (Zustand)
- **Performance**: Monitor continuously with Lighthouse
- **Testing**: Comprehensive coverage before removing legacy code

### Business Risks
- **User Experience**: Maintain all existing functionality during migration
- **Downtime**: Gradual rollout with feature flags
- **Data Loss**: Backup strategy and rollback plan

## Contributing

### Development Workflow
1. Create feature branch from `main`
2. Follow coding standards (ESLint + Prettier)
3. Write tests for new code
4. Update documentation
5. Submit pull request

### Code Standards
- **TypeScript**: Strict mode enabled
- **ESLint**: Flat config targeting `src/**/*.{ts,tsx}`
- **Prettier**: Consistent formatting
- **Testing**: Jest + Testing Library + Cypress
- **Commits**: Conventional commits

---

**Note**: The core functionality migration is complete. The remaining work focuses on styling, testing, and production optimization while maintaining all existing features.
