# Migration Strategy

## Overview
This document outlines the step-by-step migration from the current monolithic codebase to the new modular architecture. The migration is designed to be gradual, safe, and maintain backward compatibility.

## Migration Principles

### 1. Gradual Migration
- Migrate one feature at a time
- Keep existing functionality working
- Use feature flags for new components
- Maintain parallel systems during transition

### 2. Backward Compatibility
- Keep existing routes working
- Maintain existing APIs
- Preserve user data and settings
- No breaking changes for users

### 3. Risk Mitigation
- Comprehensive testing at each step
- Rollback strategy for each phase
- User feedback collection
- Performance monitoring

## Phase-by-Phase Migration

### Phase 1: Foundation Setup (Week 1-2)
**Goal**: Establish new development environment and build system

#### Week 1: Development Environment
```bash
# 1. Create new project structure
mkdir src
mkdir src/{components,features,services,utils,styles,types,hooks,stores,tests}

# 2. Setup build system
npm install --save-dev webpack webpack-cli typescript ts-loader
npm install --save-dev sass sass-loader css-loader style-loader
npm install --save-dev @types/node @types/express

# 3. Setup development tools
npm install --save-dev eslint prettier husky lint-staged
npm install --save-dev jest @testing-library/jest-dom
npm install --save-dev cypress

# 4. Setup TypeScript
npx tsc --init
```

#### Week 2: Base Infrastructure
```typescript
// 1. Create base types
// src/types/common.ts
export interface AppConfig {
  relays: string[];
  lightning: LightningConfig;
  features: FeatureFlags;
}

// 2. Create utility functions
// src/utils/constants.ts
export const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.nostr.band'
];

// 3. Create base services
// src/services/ConfigService.ts
export class ConfigService {
  static getConfig(): AppConfig {
    // Load from environment or defaults
  }
}
```

**Deliverables:**
- [x] New project structure created ✅
- [x] Build system configured ✅
- [x] TypeScript setup complete ✅
- [x] Development tools configured ✅
- [x] Base types and utilities created ✅

### Phase 2: Service Layer Extraction (Week 3-4)
**Goal**: Extract business logic from monolithic files into focused services

#### Week 3: Nostr Service Extraction
```typescript
// Extract from live.js lines 68-200
// src/services/nostr/NostrClient.ts
export class NostrClient {
  private pool: SimplePool;
  private relays: string[];

  constructor(relays: string[]) {
    this.pool = new SimplePool();
    this.relays = relays;
  }

  async subscribeToEvents(filters: Filter[]): Promise<void> {
    // Extract subscription logic from live.js
  }

  async publishEvent(event: Event): Promise<void> {
    // Extract publishing logic
  }
}

// src/services/nostr/EventManager.ts
export class EventManager {
  private client: NostrClient;

  async handleLiveEvent(event: Event): Promise<void> {
    // Extract live event handling logic
  }

  async handleZapEvent(event: Event): Promise<void> {
    // Extract zap handling logic
  }
}
```

#### Week 4: Lightning Service Extraction
```typescript
// Extract from live.js lines 4939-5374
// src/services/lightning/LightningService.ts
export class LightningService {
  async enableLightning(sessionId: string, eventId: string): Promise<LightningConfig> {
    // Extract Lightning enable logic
  }

  async disableLightning(sessionId: string): Promise<void> {
    // Extract Lightning disable logic
  }

  async handleWebhook(webhookData: WebhookData): Promise<void> {
    // Extract webhook handling logic
  }
}
```

**Deliverables:**
- [x] NostrClient service extracted ✅
- [x] EventManager service extracted ✅
- [x] LightningService extracted ✅
- [x] ProfileService extracted ✅
- [x] All services have TypeScript types ✅
- [ ] Unit tests for all services ⏳

### Phase 3: Component Extraction (Week 5-6)
**Goal**: Extract UI components from monolithic files

#### Week 5: Common Components
```typescript
// Extract from live.js lines 100-500
// src/components/common/QRCode/QRCode.tsx
export interface QRCodeProps {
  data: string;
  size?: number;
  invert?: boolean;
  screenBlend?: boolean;
}

export const QRCode: React.FC<QRCodeProps> = ({ data, size = 200, invert = false }) => {
  // Extract QR code logic
};

// src/components/common/Modal/Modal.tsx
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  // Extract modal logic
};
```

#### Week 6: Feature Components
```typescript
// Extract from live.js lines 1000-2000
// src/components/live/LiveDisplay/LiveDisplay.tsx
export const LiveDisplay: React.FC = () => {
  const { currentEvent, zaps, isLoading } = useLiveEvent();
  
  return (
    <div className="live-display">
      {/* Extract live display UI */}
    </div>
  );
};

// src/components/live/ZapList/ZapList.tsx
export const ZapList: React.FC = () => {
  const { zaps, topZappers } = useZaps();
  
  return (
    <div className="zap-list">
      {/* Extract zap list UI */}
    </div>
  );
};
```

**Deliverables:**
- [x] Common components extracted ✅
- [x] Live display components extracted ✅
- [x] Jukebox components extracted ✅
- [x] Payment components extracted ✅
- [x] All components have TypeScript types ✅
- [ ] Component tests written ⏳

### Phase 4: State Management (Week 7-8)
**Goal**: Implement modern state management

#### Week 7: Store Implementation
```typescript
// src/stores/liveStore.ts
interface LiveState {
  currentEvent: LiveEvent | null;
  zaps: Zap[];
  topZappers: Zapper[];
  styleOptions: StyleOptions;
  isLoading: boolean;
  error: string | null;
}

export const useLiveStore = create<LiveState>((set, get) => ({
  currentEvent: null,
  zaps: [],
  topZappers: [],
  styleOptions: DEFAULT_STYLES,
  isLoading: false,
  error: null,

  setCurrentEvent: (event: LiveEvent) => set({ currentEvent: event }),
  addZap: (zap: Zap) => set(state => ({ zaps: [...state.zaps, zap] })),
  updateStyleOptions: (options: Partial<StyleOptions>) => 
    set(state => ({ styleOptions: { ...state.styleOptions, ...options } })),
}));
```

#### Week 8: Custom Hooks
```typescript
// src/hooks/useLiveEvent.ts
export const useLiveEvent = () => {
  const { currentEvent, setCurrentEvent } = useLiveStore();
  const eventService = useEventService();

  useEffect(() => {
    const unsubscribe = eventService.subscribeToLiveEvents(setCurrentEvent);
    return unsubscribe;
  }, []);

  return { currentEvent };
};

// src/hooks/useZaps.ts
export const useZaps = () => {
  const { zaps, addZap } = useLiveStore();
  const zapService = useZapService();

  useEffect(() => {
    const unsubscribe = zapService.subscribeToZaps(addZap);
    return unsubscribe;
  }, []);

  return { zaps };
};
```

**Deliverables:**
- [x] Zustand stores implemented ✅
- [x] Custom hooks created ✅
- [x] State management integrated ✅
- [ ] Store tests written ⏳

### Phase 5: Feature Migration (Week 9-10)
**Goal**: Migrate features to new architecture

#### Week 9: Live Display Feature
```typescript
// src/features/live-display/LiveDisplayPage.tsx
export const LiveDisplayPage: React.FC = () => {
  return (
    <div className="live-page">
      <LiveDisplay />
      <ZapList />
      <TopZappers />
      <StyleOptions />
    </div>
  );
};

// src/features/live-display/index.ts
export { LiveDisplayPage } from './LiveDisplayPage';
export { useLiveEvent } from './hooks/useLiveEvent';
export { useZaps } from './hooks/useZaps';
```

#### Week 10: Jukebox Feature
```typescript
// src/features/jukebox/JukeboxPage.tsx
export const JukeboxPage: React.FC = () => {
  return (
    <div className="jukebox-page">
      <MusicPlayer />
      <QueueList />
      <RequestForm />
    </div>
  );
};
```

**Deliverables:**
- [x] Live display feature migrated ✅
- [x] Jukebox feature migrated ✅
- [x] Payment feature migrated ✅
- [x] All features working with new architecture ✅

### Phase 6: Styling Migration (Week 11-12)
**Goal**: Migrate CSS to SCSS modules

#### Week 11: Style System Setup
```scss
// src/styles/common/variables.scss
$primary-color: #007bff;
$secondary-color: #6c757d;
$success-color: #28a745;
$danger-color: #dc3545;

$font-family-base: 'Inter', sans-serif;
$font-size-base: 16px;

// src/styles/common/mixins.scss
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin button-base {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: $font-family-base;
}
```

#### Week 12: Component Styles
```scss
// src/components/live/LiveDisplay/LiveDisplay.module.scss
.liveDisplay {
  @include flex-center;
  min-height: 100vh;
  background: var(--bg-color);
  color: var(--text-color);
}

.qrCode {
  max-width: 50vw;
  height: auto;
  margin: 0 auto;
}

.zapList {
  max-height: 300px;
  overflow-y: auto;
}
```

**Deliverables:**
- [ ] SCSS modules implemented ⏳
- [ ] Component styles migrated ⏳
- [ ] Design system created ⏳
- [ ] Responsive design implemented ⏳

### Phase 7: Testing & Optimization (Week 13-14)
**Goal**: Add comprehensive testing and optimize performance

#### Week 13: Testing Implementation
```typescript
// src/tests/unit/services/NostrClient.test.ts
describe('NostrClient', () => {
  it('should connect to relays', async () => {
    const client = new NostrClient(['wss://relay.damus.io']);
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });
});

// src/tests/integration/live-display.test.ts
describe('Live Display Integration', () => {
  it('should display live event and zaps', async () => {
    render(<LiveDisplayPage />);
    await waitFor(() => {
      expect(screen.getByTestId('live-display')).toBeInTheDocument();
    });
  });
});
```

#### Week 14: Performance Optimization
```typescript
// Code splitting
const LiveDisplayPage = lazy(() => import('./features/live-display'));
const JukeboxPage = lazy(() => import('./features/jukebox'));

// Memoization
const ZapList = memo(({ zaps }: { zaps: Zap[] }) => {
  return (
    <div>
      {zaps.map(zap => <ZapItem key={zap.id} zap={zap} />)}
    </div>
  );
});

// Bundle optimization
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
};
```

**Deliverables:**
- [ ] Unit tests implemented ⏳
- [ ] Integration tests implemented ⏳
- [ ] E2E tests implemented ⏳
- [x] Performance optimized ✅ (Webpack optimization)
- [x] Bundle size reduced ✅ (Code splitting implemented)

## Migration Checklist

### Pre-Migration
- [ ] Backup current codebase
- [ ] Create feature branch
- [ ] Setup development environment
- [ ] Review migration plan with team

### During Migration
- [ ] Test each phase thoroughly
- [ ] Maintain backward compatibility
- [ ] Document changes
- [ ] Get user feedback

### Post-Migration
- [ ] Performance testing
- [ ] User acceptance testing
- [ ] Documentation update
- [ ] Team training

## Rollback Strategy

### Phase-Level Rollback
Each phase can be rolled back independently:
1. **Phase 1**: Revert to original build system
2. **Phase 2**: Revert to original service files
3. **Phase 3**: Revert to original components
4. **Phase 4**: Revert to original state management
5. **Phase 5**: Revert to original features
6. **Phase 6**: Revert to original styles
7. **Phase 7**: Revert to original testing

### Emergency Rollback
```bash
# Quick rollback to previous working state
git checkout main
git reset --hard HEAD~1
npm install
npm start
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
- [ ] 70% bundle size reduction
- [ ] 90+ Lighthouse score

### Maintainability
- [ ] Clear separation of concerns
- [ ] Reusable components
- [ ] Comprehensive documentation
- [ ] Easy to add new features

## Risk Mitigation

### Technical Risks
- **Complex Dependencies**: Break down into smaller, manageable pieces
- **State Management**: Use proven patterns and libraries
- **Performance**: Monitor and optimize continuously
- **Testing**: Implement comprehensive test coverage

### Business Risks
- **User Experience**: Maintain existing functionality
- **Downtime**: Use feature flags and gradual rollout
- **Data Loss**: Backup and version control
- **Team Productivity**: Provide training and documentation

This migration strategy ensures a safe, gradual transition from your current monolithic codebase to a modern, maintainable architecture while preserving all existing functionality.
