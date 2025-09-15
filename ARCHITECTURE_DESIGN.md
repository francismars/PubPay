# New Architecture Design

## Current Architecture Problems

### Monolithic Structure
```
pubpay/
├── app.js (56 lines) - Express setup
├── public/
│   ├── javascripts/
│   │   ├── live.js (5,498 lines) - EVERYTHING
│   │   ├── index.js (927 lines) - Main app
│   │   ├── jukebox.js (2,000+ lines) - Music feature
│   │   └── [8 other files] - Utilities
│   ├── stylesheets/
│   │   └── style.css (7,091 lines) - ALL STYLES
│   └── views/
│       ├── index.html
│       ├── live.html
│       └── jukebox.html
└── routes/ - Simple route handlers
```

**Issues:**
- No separation of concerns
- Massive files with mixed responsibilities
- No build system or optimization
- Inconsistent patterns and naming
- No testing or quality measures

## Proposed New Architecture

### Modern Modular Structure
```
src/
├── components/              # Reusable UI components
│   ├── common/             # Shared components
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.module.scss
│   │   │   └── Button.test.tsx
│   │   ├── Modal/
│   │   ├── QRCode/
│   │   └── LoadingSpinner/
│   ├── live/               # Live display components
│   │   ├── LiveDisplay/
│   │   ├── ZapList/
│   │   ├── TopZappers/
│   │   └── StyleOptions/
│   ├── jukebox/            # Jukebox components
│   │   ├── MusicPlayer/
│   │   ├── QueueList/
│   │   └── RequestForm/
│   └── payment/            # Payment components
│       ├── PaymentForm/
│       ├── InvoiceDisplay/
│       └── ZapButton/
├── features/               # Feature modules
│   ├── live-display/       # Live streaming feature
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── index.ts
│   ├── jukebox/            # Music queue feature
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── index.ts
│   ├── payments/           # Payment processing
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── index.ts
│   └── auth/               # Authentication
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       └── index.ts
├── services/               # Business logic layer
│   ├── nostr/              # Nostr protocol handling
│   │   ├── NostrClient.ts
│   │   ├── EventManager.ts
│   │   ├── RelayManager.ts
│   │   ├── ProfileService.ts
│   │   └── index.ts
│   ├── lightning/          # Lightning network
│   │   ├── LightningService.ts
│   │   ├── InvoiceService.ts
│   │   ├── WebhookService.ts
│   │   └── index.ts
│   ├── api/                # API layer
│   │   ├── PaymentAPI.ts
│   │   ├── ProfileAPI.ts
│   │   ├── ConfigAPI.ts
│   │   └── index.ts
│   └── storage/            # Data persistence
│       ├── LocalStorage.ts
│       ├── SessionStorage.ts
│       └── index.ts
├── utils/                  # Utility functions
│   ├── urlParser.ts
│   ├── styleUtils.ts
│   ├── zapUtils.ts
│   ├── validation.ts
│   └── constants.ts
├── styles/                 # Styling system
│   ├── common/             # Global styles
│   │   ├── variables.scss
│   │   ├── mixins.scss
│   │   ├── reset.scss
│   │   └── typography.scss
│   ├── components/         # Component styles
│   │   ├── Button.module.scss
│   │   ├── Modal.module.scss
│   │   └── QRCode.module.scss
│   └── features/           # Feature-specific styles
│       ├── live-display.scss
│       ├── jukebox.scss
│       └── payments.scss
├── types/                  # TypeScript definitions
│   ├── nostr.ts
│   ├── lightning.ts
│   ├── payment.ts
│   └── common.ts
├── hooks/                  # Custom React hooks
│   ├── useLiveEvent.ts
│   ├── useZaps.ts
│   ├── useStyleOptions.ts
│   └── useAuth.ts
├── stores/                 # State management
│   ├── liveStore.ts
│   ├── jukeboxStore.ts
│   ├── authStore.ts
│   └── index.ts
├── tests/                  # Test files
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── config/                 # Configuration
│   ├── webpack.config.js
│   ├── tsconfig.json
│   ├── eslint.config.js
│   └── jest.config.js
└── public/                 # Static assets
    ├── images/
    ├── fonts/
    └── icons/
```

## Architecture Principles

### 1. Separation of Concerns
- **Components**: Pure UI logic, no business logic
- **Services**: Business logic and data management
- **Hooks**: Reusable stateful logic
- **Utils**: Pure functions and utilities
- **Stores**: Global state management

### 2. Feature-Based Organization
- Each feature is self-contained
- Clear boundaries between features
- Minimal coupling between features
- Easy to add/remove features

### 3. Component Hierarchy
```
App
├── Router
│   ├── MainPage
│   │   ├── PaymentForm
│   │   └── PaymentList
│   ├── LivePage
│   │   ├── LiveDisplay
│   │   ├── ZapList
│   │   └── StyleOptions
│   └── JukeboxPage
│       ├── MusicPlayer
│       ├── QueueList
│       └── RequestForm
```

### 4. Data Flow Architecture
```
User Interaction
    ↓
Component (UI)
    ↓
Hook (State Logic)
    ↓
Service (Business Logic)
    ↓
API (Data Layer)
    ↓
External Service (Nostr/Lightning)
```

## Technology Stack

### Frontend
- **TypeScript**: Type safety and better DX
- **React/Vanilla JS**: Component-based UI (your choice)
- **Zustand**: Lightweight state management
- **Sass**: CSS preprocessing with modules
- **Webpack/Vite**: Module bundling and optimization

### Build Tools
- **ESLint**: Code quality and consistency
- **Prettier**: Code formatting
- **Jest**: Unit testing
- **Cypress**: E2E testing
- **Husky**: Git hooks for quality gates

### Backend (Minimal Changes)
- **Express.js**: Keep existing server
- **TypeScript**: Add type safety
- **Jest**: Add testing
- **ESLint**: Code quality

## Module Dependencies

### Core Dependencies
```
src/
├── components/ (depends on: types, utils, styles)
├── features/ (depends on: components, services, hooks, stores)
├── services/ (depends on: types, utils, api)
├── hooks/ (depends on: services, stores, types)
├── stores/ (depends on: services, types)
└── utils/ (depends on: types)
```

### External Dependencies
- **NostrTools**: Nostr protocol handling
- **Bolt11**: Lightning invoice parsing
- **QRious**: QR code generation
- **LNBits**: Lightning payments

## State Management Strategy

### Global State (Zustand)
```typescript
// stores/liveStore.ts
interface LiveState {
  currentEvent: LiveEvent | null;
  zaps: Zap[];
  topZappers: Zapper[];
  styleOptions: StyleOptions;
  isLoading: boolean;
  error: string | null;
}

// stores/jukeboxStore.ts
interface JukeboxState {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  volume: number;
}

// stores/authStore.ts
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  signInMethod: SignInMethod;
}
```

### Local State (React Hooks)
- Component-specific state
- Form state
- UI state (modals, toggles)
- Temporary data

## Error Handling Strategy

### Error Boundaries
```typescript
// components/common/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  // Catch and display errors gracefully
}

// services/ErrorService.ts
class ErrorService {
  static handle(error: Error, context: string) {
    // Log error, show user-friendly message
  }
}
```

### Error Types
- **Network Errors**: API failures, connection issues
- **Validation Errors**: Form validation, data validation
- **Business Logic Errors**: Payment failures, auth failures
- **System Errors**: Unexpected errors, crashes

## Performance Optimization

### Code Splitting
```typescript
// Lazy load features
const LivePage = lazy(() => import('./features/live-display'));
const JukeboxPage = lazy(() => import('./features/jukebox'));

// Lazy load components
const StyleOptions = lazy(() => import('./components/live/StyleOptions'));
```

### Bundle Optimization
- **Tree Shaking**: Remove unused code
- **Minification**: Compress JavaScript and CSS
- **Compression**: Gzip/Brotli compression
- **Caching**: Long-term caching for static assets

### Runtime Optimization
- **Memoization**: Prevent unnecessary re-renders
- **Virtual Scrolling**: For large lists
- **Image Optimization**: WebP, lazy loading
- **Service Workers**: Offline support

## Testing Strategy

### Unit Tests (Jest)
- **Utils**: Pure functions
- **Services**: Business logic
- **Hooks**: Custom hooks
- **Components**: UI components

### Integration Tests (Jest + Testing Library)
- **Feature workflows**: End-to-end feature testing
- **API integration**: Service layer testing
- **State management**: Store testing

### E2E Tests (Cypress)
- **Critical user journeys**: Payment flow, live display
- **Cross-browser testing**: Chrome, Firefox, Safari
- **Mobile testing**: Responsive design

## Migration Strategy

### Phase 1: Foundation
1. Setup build system and TypeScript
2. Create new project structure
3. Setup testing framework
4. Create base components

### Phase 2: Service Layer
1. Extract Nostr service from live.js
2. Extract Lightning service
3. Create API layer
4. Add error handling

### Phase 3: Component Migration
1. Extract UI components
2. Create feature modules
3. Implement state management
4. Add styling system

### Phase 4: Integration
1. Connect components to services
2. Implement routing
3. Add error boundaries
4. Performance optimization

### Phase 5: Testing & Polish
1. Add comprehensive tests
2. Performance optimization
3. Accessibility improvements
4. Documentation

## Success Metrics

### Code Quality
- [ ] 100% TypeScript coverage
- [ ] 90% test coverage
- [ ] 0 ESLint errors
- [ ] No files over 500 lines

### Performance
- [ ] <3s initial load time
- [ ] <100ms interaction response
- [ ] 70% bundle size reduction
- [ ] 90+ Lighthouse score

### Maintainability
- [ ] Clear separation of concerns
- [ ] Reusable components
- [ ] Comprehensive documentation
- [ ] Easy to add new features

This architecture will transform your codebase from a monolithic mess into a maintainable, scalable, and performant application while preserving all existing functionality.
