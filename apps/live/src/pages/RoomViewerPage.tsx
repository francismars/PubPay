import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getApiBase } from '../utils/apiBase';
import { StyleConfig } from '../components/StyleEditor';
import { appSessionStorage } from '../utils/storage';

// Fullscreen vendor typings
type VendorFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type VendorFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

type ViewPayload = {
  active: { slotStart: string; slotEnd: string } | null;
  items: string[];
  policy: { type: 'round_robin' | 'random' | 'weighted'; intervalSec: number };
  index: number;
  nextSwitchAt: string;
  defaultItems: string[];
  upcomingSlots?: Array<{ startAt: string; endAt: string; items: string[] }>;
  previousSlots?: Array<{ startAt: string; endAt: string; items: string[] }>;
};

export const RoomViewerPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const [view, setView] = useState<ViewPayload | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [previousShouldSlideOut, setPreviousShouldSlideOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverNowIso, setServerNowIso] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>('');
  const [showIdCopied, setShowIdCopied] = useState(false);
  const [styleConfig, setStyleConfig] = useState<StyleConfig | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const navigate = useNavigate();

  // Simulation mode state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simTime, setSimTime] = useState<string>(new Date().toISOString());
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<number>(1); // 1x, 5x, 15x
  const simIntervalRef = useRef<number | null>(null);
  // Anchor for continuous simulated time during playback
  const simAnchorRef = useRef<{ simMs: number; realMs: number } | null>(null);

  const items = view?.items ?? [];
  const actualIndex = view?.index ?? currentIndex;
  const currentRef = useMemo(
    () =>
      items.length && typeof actualIndex === 'number'
        ? items[actualIndex % items.length]
        : null,
    [items, actualIndex]
  );

  // Track previous index for slide-out animation
  const prevActualIndexRef = useRef<number | null>(null);
  const slideOutTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const currentPreviousIndexRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (items.length > 0) {
      const normalized = actualIndex % items.length;
      const prevNormalized = prevActualIndexRef.current !== null 
        ? prevActualIndexRef.current % items.length 
        : null;
      
      // If index changed, update previousIndex to the old value
      if (prevNormalized !== null && prevNormalized !== normalized) {
        // Clear any existing timers from previous transitions
        if (slideOutTimerRef.current !== null) {
          clearTimeout(slideOutTimerRef.current);
          slideOutTimerRef.current = null;
        }
        if (clearTimerRef.current !== null) {
          clearTimeout(clearTimerRef.current);
          clearTimerRef.current = null;
        }
        
        // Reset state for new transition
        // The new incoming slide (z-index: 2) will cover the old previous slide anyway
        setPreviousIndex(prevNormalized);
        currentPreviousIndexRef.current = prevNormalized;
        setPreviousShouldSlideOut(false); // Start with previous staying in place
        
        // After new slide finishes sliding in (500ms), start sliding out previous
        slideOutTimerRef.current = window.setTimeout(() => {
          // Double-check we're still on the same transition before sliding out
          if (currentPreviousIndexRef.current === prevNormalized) {
            setPreviousShouldSlideOut(true);
          }
          slideOutTimerRef.current = null;
        }, 500);
        
        // Clear previousIndex after previous finishes sliding out (500ms slide-in + 500ms slide-out)
        clearTimerRef.current = window.setTimeout(() => {
          // Only clear if this is still the current previous slide
          if (currentPreviousIndexRef.current === prevNormalized) {
            setPreviousIndex(null);
            setPreviousShouldSlideOut(false);
            currentPreviousIndexRef.current = null;
          }
          clearTimerRef.current = null;
        }, 1000);
      }
      
      // Store current as ref for next change
      prevActualIndexRef.current = actualIndex;
    }
  }, [actualIndex, items.length]);
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (slideOutTimerRef.current !== null) {
        clearTimeout(slideOutTimerRef.current);
      }
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);
  const iframeRefs = useRef<
    Map<string, React.RefObject<HTMLIFrameElement | null>>
  >(new Map());
  const switchTimerRef = useRef<number | null>(null);
  const swiperContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettingsSidebar, setShowSettingsSidebar] = useState(false);
  const [showCurrentItemCopied, setShowCurrentItemCopied] = useState(false);
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());

  // Fullscreen controls for the note container
  const enterFullscreen = useCallback(async () => {
    const el = swiperContainerRef.current as VendorFullscreenElement | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } catch {
      /* ignore */
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      const doc = document as VendorFullscreenDocument;
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
      setIsFullscreen(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onChange: EventListener = () => {
      const doc = document as VendorFullscreenDocument;
      const fsEl =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.msFullscreenElement;
      setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener(
      'webkitfullscreenchange',
      onChange as EventListener
    );
    document.addEventListener('MSFullscreenChange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        onChange as EventListener
      );
      document.removeEventListener(
        'MSFullscreenChange',
        onChange as EventListener
      );
    };
  }, []);

  // Fetch view with optional simulation time
  const fetchView = useCallback(
    async (atTime?: string) => {
      if (!roomId) return;
      try {
        const url = `${getApiBase()}/multi/${roomId}/view${atTime ? `?at=${encodeURIComponent(atTime)}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 404) {
            navigate('/live/multi', { replace: true });
          } else {
            setError('Failed to load view');
            setView(null);
          }
          return;
        }
        const json = await res.json();
        if (!json?.success || !json?.data) {
          setError('Invalid response');
          setView(null);
          return;
        }
        const payload: ViewPayload = json.data;
        setView(payload);
        setCurrentIndex(typeof payload.index === 'number' ? payload.index : 0);
        setError(null);
      } catch {
        setError('Network error');
        setView(null);
      }
    },
    [roomId, navigate]
  );

  // Fetch room details (name and style config)
  const fetchRoomDetails = useCallback(async () => {
    if (!roomId) return;
    try {
      const storedPassword = appSessionStorage.getItem<string>(`room_${roomId}_password`);
      let res;
      if (storedPassword) {
        res = await fetch(`${getApiBase()}/multi/${roomId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: storedPassword })
        });
      } else {
        res = await fetch(`${getApiBase()}/multi/${roomId}`);
      }
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json?.data?.config) {
          if (json.data.config.name) {
            setRoomName(json.data.config.name);
          }
          if (json.data.config.styleConfig) {
            setStyleConfig(json.data.config.styleConfig);
          } else {
            setStyleConfig(null);
          }
        }
      }
    } catch {
      // Ignore errors - room name and style config are optional
    }
  }, [roomId]);

  // Build URL with style parameters
  const buildStyledUrl = useCallback((baseUrl: string, styles: StyleConfig | null): string => {
    if (!styles || Object.keys(styles).length === 0) {
      return baseUrl;
    }
    const params = new URLSearchParams();
    if (styles.textColor) params.set('textColor', styles.textColor);
    if (styles.bgColor) params.set('bgColor', styles.bgColor);
    if (styles.bgImage) params.set('bgImage', styles.bgImage);
    if (styles.opacity !== undefined) params.set('opacity', String(styles.opacity));
    if (styles.textOpacity !== undefined) params.set('textOpacity', String(styles.textOpacity));
    if (styles.qrInvert) params.set('qrInvert', 'true');
    if (styles.qrScreenBlend) params.set('qrScreenBlend', 'true');
    if (styles.qrMultiplyBlend) params.set('qrMultiplyBlend', 'true');
    if (styles.qrShowWebLink) params.set('qrShowWebLink', 'true');
    if (styles.qrShowNevent !== undefined) params.set('qrShowNevent', String(styles.qrShowNevent));
    if (styles.qrShowNote) params.set('qrShowNote', 'true');
    if (styles.layoutInvert) params.set('layoutInvert', 'true');
    if (styles.hideZapperContent) params.set('hideZapperContent', 'true');
    if (styles.showTopZappers) params.set('showTopZappers', 'true');
    if (styles.podium) params.set('podium', 'true');
    if (styles.zapGrid) params.set('zapGrid', 'true');
    if (styles.sectionLabels) params.set('sectionLabels', 'true');
    if (styles.qrOnly) params.set('qrOnly', 'true');
    if (styles.showFiat) params.set('showFiat', 'true');
    if (styles.showHistoricalPrice) params.set('showHistoricalPrice', 'true');
    if (styles.showHistoricalChange) params.set('showHistoricalChange', 'true');
    if (styles.fiatOnly) params.set('fiatOnly', 'true');
    if (styles.lightning) params.set('lightning', 'true');
    if (styles.selectedCurrency) params.set('selectedCurrency', styles.selectedCurrency);
    if (styles.partnerLogo) params.set('partnerLogo', styles.partnerLogo);
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, []);


  const copyRoomId = useCallback(() => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setShowIdCopied(true);
    setTimeout(() => setShowIdCopied(false), 2000);
  }, [roomId]);

  // Initial load - check for URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const atParam = params.get('at');
    if (atParam) {
      setIsSimulating(true);
      setSimTime(atParam);
      fetchView(atParam);
    } else {
      fetchView();
    }
    fetchRoomDetails();
  }, [roomId, fetchView, fetchRoomDetails]);

  // SSE connection - only when NOT simulating
  useEffect(() => {
    if (!roomId || isSimulating) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }
    // Close any existing connection first
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    // open SSE connection
    const es = new EventSource(`${getApiBase()}/multi/${roomId}/events`);
    esRef.current = es;
    const handleSnapshot = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const payload: ViewPayload = data.view;
        setView(payload);
        setCurrentIndex(typeof payload.index === 'number' ? payload.index : 0);
      } catch {
        void 0;
      }
    };
    const handleTick = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (typeof data.index === 'number') setCurrentIndex(data.index);
        if (typeof data.at === 'string') setServerNowIso(data.at);
      } catch {
        void 0;
      }
    };
    es.addEventListener('snapshot', handleSnapshot);
    es.addEventListener('tick', handleTick);
    es.addEventListener('schedule-updated', () => {
      // no refetch needed; server will emit a fresh snapshot right after update
    });
    es.addEventListener('config-updated', () => {
      // Refetch room details to get updated styleConfig
      fetchRoomDetails();
    });
    es.onerror = () => {
      // Let EventSource auto-reconnect
    };
    return () => {
      es.removeEventListener('snapshot', handleSnapshot);
      es.removeEventListener('tick', handleTick);
      es.close();
      esRef.current = null;
    };
  }, [roomId, isSimulating, fetchRoomDetails]);

  // Simulation controls
  const stepTime = useCallback(
    (minutes: number) => {
      setSimTime(prev => {
        const current = new Date(prev);
        current.setMinutes(current.getMinutes() + minutes);
        const newTime = current.toISOString();
        fetchView(newTime);
        // Update URL to reflect new time
        window.history.pushState(
          {},
          '',
          `${window.location.pathname}?at=${encodeURIComponent(newTime)}`
        );
        return newTime;
      });
    },
    [fetchView]
  );

  const jumpToSlot = useCallback(
    (direction: 'next' | 'prev') => {
      const current = new Date(simTime);
      let target: { startAt: string; endAt: string; items: string[] } | null =
        null;

      if (direction === 'next') {
        if (view?.upcomingSlots && view.upcomingSlots.length > 0) {
          target =
            view.upcomingSlots.find(s => new Date(s.startAt) > current) ||
            view.upcomingSlots[0];
        }
      } else {
        // Try previous slots first
        if (view?.previousSlots && view.previousSlots.length > 0) {
          target = view.previousSlots[0]; // Most recent previous slot
        } else if (view?.upcomingSlots && view.upcomingSlots.length > 0) {
          // Fallback to upcoming if no previous slots
          const prev = view.upcomingSlots.filter(
            s => new Date(s.endAt) < current
          );
          target =
            prev.length > 0 ? prev[prev.length - 1] : view.upcomingSlots[0];
        }
      }
      if (target) {
        const newTime = new Date(target.startAt).toISOString();
        setSimTime(newTime);
        fetchView(newTime);
      }
    },
    [simTime, view, fetchView]
  );

  const toggleSimulation = useCallback(() => {
    if (isSimulating) {
      setIsSimulating(false);
      setIsPlaying(false);
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      setSimTime(new Date().toISOString());
      fetchView(); // Fetch current time
      // Update URL
      window.history.pushState({}, '', window.location.pathname);
    } else {
      setIsSimulating(true);
      const nowISO = new Date().toISOString();
      setSimTime(nowISO);
      fetchView(nowISO);
      window.history.pushState(
        {},
        '',
        `${window.location.pathname}?at=${encodeURIComponent(nowISO)}`
      );
    }
  }, [isSimulating, fetchView]);

  const togglePlay = useCallback(() => {
    if (!isSimulating) return;
    setIsPlaying(prev => {
      const next = !prev;
      if (next) {
        // starting playback: set anchor
        simAnchorRef.current = {
          simMs: new Date(simTime).getTime(),
          realMs: Date.now()
        };
      } else {
        // pausing: materialize the progressed sim time into simTime
        if (simAnchorRef.current) {
          const progressed =
            simAnchorRef.current.simMs +
            (Date.now() - simAnchorRef.current.realMs) * simSpeed;
          const iso = new Date(progressed).toISOString();
          setSimTime(iso);
        }
        simAnchorRef.current = null;
      }
      return next;
    });
  }, [isSimulating, simTime, simSpeed]);

  // Play/pause simulation timer
  useEffect(() => {
    if (!isSimulating || !isPlaying) {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      return;
    }

    const intervalMs = (1000 * 60) / simSpeed; // 1 minute per interval at 1x speed
    simIntervalRef.current = window.setInterval(() => {
      stepTime(1); // Step forward 1 minute
    }, intervalMs);

    return () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
    };
  }, [isSimulating, isPlaying, simSpeed, stepTime]);

  // When simSpeed changes during playback, re-anchor so continuous time stays accurate
  useEffect(() => {
    if (isSimulating && isPlaying) {
      simAnchorRef.current = {
        simMs: new Date(simTime).getTime(),
        realMs: Date.now()
      };
    }
  }, [simSpeed]);

  // Update when simTime changes manually
  useEffect(() => {
    if (isSimulating && !isPlaying) {
      fetchView(simTime);
    }
  }, [simTime, isSimulating, isPlaying, fetchView]);

  // Helper to get or create a ref for an item
  const getIframeRef = useCallback(
    (item: string): React.RefObject<HTMLIFrameElement | null> => {
      if (!iframeRefs.current.has(item)) {
        iframeRefs.current.set(item, React.createRef<HTMLIFrameElement>());
      }
      return iframeRefs.current.get(item)!;
    },
    []
  );

  // Clean up refs for removed items
  useEffect(() => {
    const currentItems = new Set(items);
    for (const item of iframeRefs.current.keys()) {
      if (!currentItems.has(item)) {
        iframeRefs.current.delete(item);
      }
    }
  }, [items]);

  // Instant switch at boundaries: schedule a precise refresh at nextSwitchAt (only in live mode)
  useEffect(() => {
    if (switchTimerRef.current) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
    if (!view?.nextSwitchAt || !roomId || isSimulating) return;
    const delayMs = new Date(view.nextSwitchAt).getTime() - Date.now();
    if (delayMs <= 0 || !isFinite(delayMs)) return;
    switchTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`${getApiBase()}/multi/${roomId}/view`);
        if (res.ok) {
          const json = await res.json();
          if (json?.success && json?.data) {
            const payload: ViewPayload = json.data;
            setView(payload);
            setCurrentIndex(
              typeof payload.index === 'number' ? payload.index : 0
            );
          }
        }
      } catch {
        /* ignore */
      }
    }, delayMs);
    return () => {
      if (switchTimerRef.current) {
        window.clearTimeout(switchTimerRef.current);
        switchTimerRef.current = null;
      }
    };
  }, [view?.nextSwitchAt, roomId, isSimulating]);

  // Real-time ticker for countdown UI updates (updates every second)
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setTick(Date.now()); // Update every second to trigger recalculation
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const formatUTC = (iso?: string | null) =>
    iso ? new Date(iso).toUTCString() : '—';
  // Get current reference time (simulated or real)
  const getCurrentTime = () => {
    if (!isSimulating) return Date.now();
    if (isPlaying && simAnchorRef.current) {
      // continuous simulated time = anchor + elapsed*simSpeed
      return (
        simAnchorRef.current.simMs +
        (Date.now() - simAnchorRef.current.realMs) * simSpeed
      );
    }
    return new Date(simTime).getTime();
  };
  // Calculate countdown - recalculates when tick updates
  const nextSwitchIn = useMemo(() => {
    if (!view?.nextSwitchAt) return null;
    const ms = new Date(view.nextSwitchAt).getTime() - getCurrentTime();
    if (isNaN(ms)) return null;
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [view?.nextSwitchAt, isSimulating, simTime, tick]);

  // In simulation mode, switch items locally at the exact simulated nextSwitchAt
  useEffect(() => {
    if (!isSimulating) return;
    if (!view?.nextSwitchAt) return;
    if (!items || items.length === 0) return;

    const nowMs = getCurrentTime();
    const nextMs = new Date(view.nextSwitchAt).getTime();
    const delay = nextMs - nowMs;
    if (delay <= 0) return; // will be handled on next render tick

    const slotEndMs = view.active
      ? new Date(view.active.slotEnd).getTime()
      : Number.POSITIVE_INFINITY;

    const id = window.setTimeout(() => {
      // If we're hitting the slot boundary, refetch view at the simulated time
      if (nextMs >= slotEndMs - 1) {
        const iso = new Date(getCurrentTime()).toISOString();
        fetchView(iso);
        return;
      }

      // Otherwise rotate locally if multiple items
      if (items.length > 1) {
        setCurrentIndex(prev => (prev + 1) % items.length);
        // schedule next local rotation by updating nextSwitchAt so the effect re-arms
        const intervalSec = view?.policy?.intervalSec || 60;
        const nowAfter = getCurrentTime();
        const nextLocal = Math.min(slotEndMs, nowAfter + intervalSec * 1000);
        setView(prev =>
          prev
            ? { ...prev, nextSwitchAt: new Date(nextLocal).toISOString() }
            : prev
        );
      }
    }, delay);

    return () => window.clearTimeout(id);
  }, [
    isSimulating,
    view?.nextSwitchAt,
    view?.active?.slotEnd,
    items,
    getCurrentTime,
    fetchView
  ]);

  // Convert UTC ISO to local datetime-local format
  const utcToLocal = (utcISO: string): string => {
    const date = new Date(utcISO);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  // Convert local datetime-local to UTC ISO
  const localToUTC = (localStr: string): string => {
    return new Date(localStr).toISOString();
  };

  const copySimUrl = useCallback(() => {
    if (!isSimulating) return;
    const url = `${window.location.origin}${window.location.pathname}?at=${encodeURIComponent(simTime)}`;
    navigator.clipboard.writeText(url);
    setSuccess('Simulation URL copied!');
    setTimeout(() => setSuccess(null), 2000);
  }, [isSimulating, simTime]);

  const copyItemRef = useCallback(
    (item: string, showCheckmark = false) => {
      navigator.clipboard.writeText(item);
      if (showCheckmark) {
        setCopiedItems(prev => new Set(prev).add(item));
        setTimeout(() => {
          setCopiedItems(prev => {
            const next = new Set(prev);
            next.delete(item);
            return next;
          });
        }, 2000);
        if (item === currentRef) {
          setShowCurrentItemCopied(true);
          setTimeout(() => setShowCurrentItemCopied(false), 2000);
        }
      } else {
        setSuccess('Item reference copied!');
        setTimeout(() => setSuccess(null), 2000);
      }
    },
    [currentRef]
  );

  const shortenRef = (ref: string): string => {
    if (ref.length <= 20) return ref;
    return `${ref.substring(0, 10)}...${ref.substring(ref.length - 7)}`;
  };

  const formatSlotTime = (
    startAt: string,
    endAt: string
  ): { date: string; timeRange: string } => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const dateStr = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = `${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    return { date: dateStr, timeRange: timeStr };
  };

  // PubPay style constants
  const pubPayStyle = {
    fontFamily: "'Inter', sans-serif",
    primaryColor: '#4a75ff',
    bgPrimary: '#ffffff',
    bgSecondary: '#f8f9fa',
    borderColor: '#e5e7eb',
    textPrimary: '#333333',
    textSecondary: '#555555',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)'
  };

  return (
    <div
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        height: '100vh',
        background: '#ffffff',
        overflow: 'hidden'
      }}
    >
      {/* Header - Room Name and ID */}
      <div
        style={{ background: '#ffffff', border: 'none', padding: '0 16 0 16' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>
              {roomName || 'Multi LIVE Viewer'}
            </h2>
            {roomId && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: '6px 8px'
                }}
              >
                <span
                  style={{ fontSize: 10, color: '#4b5563', marginRight: 4 }}
                >
                  ID:
                </span>
                <span
                  style={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    fontSize: 10,
                    color: '#374151'
                  }}
                >
                  {roomId}
                </span>
                <button
                  onClick={copyRoomId}
                  aria-label="Copy ID"
                  title="Copy ID"
                  style={{
                    width: 18,
                    height: 18,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 10,
                    transition: 'all 0.2s'
                  }}
                >
                  {showIdCopied ? '✓' : '📋'}
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowSettingsSidebar(true)}
              style={{
                padding: '10px',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '20px',
                fontFamily: pubPayStyle.fontFamily,
                transition: 'all 0.2s ease',
                color: pubPayStyle.textPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.borderColor = '#4a75ff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#f9fafb';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
              title="Settings"
              aria-label="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Messages */}
        {success && (
          <div
            style={{
              padding: '12px 16px',
              background: '#d1fae5',
              color: '#065f46',
              borderRadius: pubPayStyle.borderRadius,
              marginBottom: 16,
              border: '1px solid #10b981',
              fontFamily: pubPayStyle.fontFamily
            }}
          >
            {success}
          </div>
        )}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: pubPayStyle.borderRadius,
              marginBottom: 16,
              border: '1px solid #ef4444',
              fontFamily: pubPayStyle.fontFamily
            }}
          >
            {error}
          </div>
        )}

        {view ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Viewer Container */}
            <div
              ref={swiperContainerRef}
              style={{
                flex: 1,
                minHeight: 0,
                border: `1px solid ${pubPayStyle.borderColor}`,
                borderRadius: pubPayStyle.borderRadius,
                overflow: 'hidden',
                position: 'relative',
                background: pubPayStyle.bgPrimary,
                boxShadow: pubPayStyle.boxShadow
              }}
            >
              {/* Floating Fullscreen Button */}
              {!isFullscreen && (
                <button
                  onClick={enterFullscreen}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    zIndex: 10,
                    padding: '8px',
                    borderRadius: '6px',
                    border: `1px solid rgba(229, 231, 235, 0.5)`,
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(8px)',
                    cursor: 'pointer',
                    fontSize: '18px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background =
                      'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.borderColor =
                      'rgba(74, 117, 255, 0.6)';
                    e.currentTarget.style.boxShadow =
                      '0 4px 12px rgba(74, 117, 255, 0.2)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background =
                      'rgba(255, 255, 255, 0.7)';
                    e.currentTarget.style.borderColor =
                      'rgba(229, 231, 235, 0.5)';
                    e.currentTarget.style.boxShadow =
                      '0 2px 8px rgba(0, 0, 0, 0.1)';
                  }}
                  title="Enter fullscreen"
                  aria-label="Enter fullscreen"
                >
                  ⤢
                </button>
              )}
              {items.length > 0 ? (
                items.map((item, idx) => {
                  const normalizedIdx = idx % items.length;
                  const normalizedActual = actualIndex % items.length;
                  const isActive = normalizedIdx === normalizedActual;
                  const isPrevious = previousIndex !== null && normalizedIdx === previousIndex;
                  
                  // Determine slide direction and z-index
                  let transform: string;
                  let zIndex: number;
                  
                  if (isActive) {
                    transform = 'translateX(0)'; // Active: slide in from right to center
                    zIndex = 2; // On top during slide-in
                  } else if (isPrevious) {
                    // Previous: stays in place until new slide finishes, then slides out left
                    transform = previousShouldSlideOut ? 'translateX(-100%)' : 'translateX(0)';
                    zIndex = 1; // Underneath the incoming slide
                  } else {
                    transform = 'translateX(100%)'; // Others: wait off-screen right
                    zIndex = 0;
                  }
                  
                  const base = window.location.origin;
                  // Items are Nostr note IDs - load them via /live/ route
                  const baseUrl = `${base}/live/${encodeURIComponent(item)}`;
                  const styledUrl = buildStyledUrl(baseUrl, styleConfig);
                  // Include style config in key to force reload when styles change
                  // Create a stable hash by sorting keys
                  const styleHash = styleConfig 
                    ? JSON.stringify(
                        Object.keys(styleConfig)
                          .sort()
                          .reduce((acc, key) => {
                            acc[key] = (styleConfig as any)[key];
                            return acc;
                          }, {} as Record<string, unknown>)
                      )
                    : '';
                  return (
                    <iframe
                      key={`${item}-${styleHash}`}
                      ref={getIframeRef(item)}
                      src={styledUrl}
                      title={`Live Viewer ${idx + 1}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: '0',
                        display: 'block',
                        transform,
                        transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        pointerEvents: isActive ? 'auto' : 'none',
                        zIndex
                      }}
                    />
                  );
                })
              ) : (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: pubPayStyle.textSecondary,
                    fontFamily: pubPayStyle.fontFamily
                  }}
                >
                  (no item)
                </div>
              )}

              {/* Floating Current Item Card */}
              {currentRef && !isFullscreen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    left: 12,
                    zIndex: 10,
                    padding: 12,
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(12px)',
                    border: `1px solid rgba(229, 231, 235, 0.5)`,
                    borderRadius: pubPayStyle.borderRadius,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                    maxWidth: '400px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      color: pubPayStyle.textPrimary,
                      marginBottom: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap'
                    }}
                  >
                    <strong>Current item:</strong>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 6px',
                        background: pubPayStyle.bgPrimary,
                        border: `1px solid ${pubPayStyle.borderColor}`,
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontFamily: 'monospace',
                        color: pubPayStyle.textSecondary
                      }}
                    >
                      <span>{shortenRef(currentRef)}</span>
                      <button
                        onClick={() => copyItemRef(currentRef, true)}
                        style={{
                          padding: '2px 3px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '10px',
                          color:
                            showCurrentItemCopied || copiedItems.has(currentRef)
                              ? '#10b981'
                              : pubPayStyle.textSecondary,
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.2s ease'
                        }}
                        onMouseEnter={e => {
                          if (
                            !showCurrentItemCopied &&
                            !copiedItems.has(currentRef)
                          ) {
                            e.currentTarget.style.color =
                              pubPayStyle.primaryColor;
                          }
                        }}
                        onMouseLeave={e => {
                          if (
                            !showCurrentItemCopied &&
                            !copiedItems.has(currentRef)
                          ) {
                            e.currentTarget.style.color =
                              pubPayStyle.textSecondary;
                          }
                        }}
                        title="Copy full reference"
                        aria-label="Copy"
                      >
                        {showCurrentItemCopied || copiedItems.has(currentRef)
                          ? '✓'
                          : '📋'}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: pubPayStyle.textPrimary,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap'
                    }}
                  >
                    <strong>Next switch:</strong>{' '}
                    <span>
                      {nextSwitchIn
                        ? nextSwitchIn
                        : view?.nextSwitchAt
                          ? new Date(view.nextSwitchAt).toLocaleString()
                          : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
              textAlign: 'center',
              fontSize: '16px',
              color: pubPayStyle.textSecondary,
              fontFamily: pubPayStyle.fontFamily
            }}
          >
            Loading…
          </div>
        )}
      </div>

      {/* Settings Sidebar */}
      {showSettingsSidebar && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 999,
              animation: 'fadeIn 0.2s ease'
            }}
            onClick={() => setShowSettingsSidebar(false)}
          />
          {/* Sidebar */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '400px',
              maxWidth: '90vw',
              height: '100vh',
              background: pubPayStyle.bgPrimary,
              boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
              zIndex: 1000,
              overflowY: 'auto',
              transform: showSettingsSidebar
                ? 'translateX(0)'
                : 'translateX(100%)',
              transition: 'transform 0.3s ease',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Sidebar Header */}
            <div
              style={{
                padding: '24px',
                borderBottom: `1px solid ${pubPayStyle.borderColor}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                background: pubPayStyle.bgPrimary,
                zIndex: 1
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 600,
                  color: pubPayStyle.textPrimary,
                  fontFamily: pubPayStyle.fontFamily
                }}
              >
                Settings
              </h2>
              <button
                onClick={() => setShowSettingsSidebar(false)}
                style={{
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '24px',
                  color: pubPayStyle.textSecondary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = pubPayStyle.bgSecondary;
                  e.currentTarget.style.color = pubPayStyle.textPrimary;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = pubPayStyle.textSecondary;
                }}
              >
                ×
              </button>
            </div>

            {/* Sidebar Content */}
            <div style={{ padding: '24px', flex: 1 }}>
              {/* Simulation Mode Toggle */}
              <div style={{ marginBottom: 32 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16
                  }}
                >
                  <label
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: pubPayStyle.textPrimary,
                      fontFamily: pubPayStyle.fontFamily
                    }}
                  >
                    Simulation Mode
                  </label>
                  <button
                    onClick={toggleSimulation}
                    style={{
                      padding: '8px 16px',
                      background: isSimulating
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                        : 'linear-gradient(135deg, #4a75ff 0%, #3b5bdb 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '14px',
                      fontFamily: pubPayStyle.fontFamily,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isSimulating ? '🔴 Disable' : '▶️ Enable'}
                  </button>
                </div>
                {isSimulating && (
                  <div
                    style={{
                      padding: 16,
                      background: '#fff3cd',
                      border: '1px solid #ffc107',
                      borderRadius: pubPayStyle.borderRadius,
                      marginTop: 16
                    }}
                  >
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#856404',
                        marginBottom: 16
                      }}
                    >
                      <strong>🔴 SIMULATION MODE ACTIVE</strong>
                    </div>

                    {/* Simulation Time */}
                    <div style={{ marginBottom: 16 }}>
                      <label
                        style={{
                          fontSize: '13px',
                          display: 'block',
                          marginBottom: 8,
                          color: '#856404',
                          fontWeight: 600
                        }}
                      >
                        Simulation Time (local):
                      </label>
                      <input
                        type="datetime-local"
                        value={utcToLocal(simTime)}
                        onChange={e => {
                          const newTime = localToUTC(e.target.value);
                          setSimTime(newTime);
                          window.history.pushState(
                            {},
                            '',
                            `${window.location.pathname}?at=${encodeURIComponent(newTime)}`
                          );
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: `1px solid ${pubPayStyle.borderColor}`,
                          borderRadius: '6px',
                          fontFamily: pubPayStyle.fontFamily,
                          fontSize: '14px',
                          background: pubPayStyle.bgPrimary
                        }}
                      />
                    </div>

                    {/* Time Navigation */}
                    <div style={{ marginBottom: 16 }}>
                      <label
                        style={{
                          fontSize: '13px',
                          display: 'block',
                          marginBottom: 8,
                          color: '#856404',
                          fontWeight: 600
                        }}
                      >
                        Navigate Time:
                      </label>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          marginBottom: 8
                        }}
                      >
                        <button
                          onClick={() => jumpToSlot('prev')}
                          disabled={
                            !view?.previousSlots?.length &&
                            !view?.upcomingSlots?.length
                          }
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontFamily: pubPayStyle.fontFamily,
                            opacity:
                              !view?.previousSlots?.length &&
                              !view?.upcomingSlots?.length
                                ? 0.5
                                : 1
                          }}
                        >
                          ⏮ Previous Slot
                        </button>
                        <button
                          onClick={() => jumpToSlot('next')}
                          disabled={!view?.upcomingSlots?.length}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontFamily: pubPayStyle.fontFamily,
                            opacity: !view?.upcomingSlots?.length ? 0.5 : 1
                          }}
                        >
                          Next Slot ⏭
                        </button>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: 8
                        }}
                      >
                        <button
                          onClick={() => stepTime(-60)}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontFamily: pubPayStyle.fontFamily
                          }}
                        >
                          ⏪ -1h
                        </button>
                        <button
                          onClick={() => stepTime(-5)}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontFamily: pubPayStyle.fontFamily
                          }}
                        >
                          ⏩ -5m
                        </button>
                        <button
                          onClick={() => stepTime(5)}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontFamily: pubPayStyle.fontFamily
                          }}
                        >
                          +5m ⏩
                        </button>
                        <button
                          onClick={() => stepTime(60)}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontFamily: pubPayStyle.fontFamily
                          }}
                        >
                          +1h ⏩
                        </button>
                      </div>
                    </div>

                    {/* Play/Pause Controls */}
                    <div style={{ marginBottom: 16 }}>
                      <div
                        style={{ display: 'flex', gap: 8, marginBottom: 12 }}
                      >
                        <button
                          onClick={togglePlay}
                          disabled={!isSimulating}
                          style={{
                            flex: 1,
                            padding: '10px 16px',
                            fontSize: '14px',
                            background: isPlaying
                              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                              : 'linear-gradient(135deg, #4a75ff 0%, #3b5bdb 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontFamily: pubPayStyle.fontFamily
                          }}
                        >
                          {isPlaying ? '⏸ Pause' : '▶ Play'}
                        </button>
                        <button
                          onClick={copySimUrl}
                          style={{
                            padding: '10px 16px',
                            fontSize: '14px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            fontFamily: pubPayStyle.fontFamily,
                            color: pubPayStyle.textPrimary
                          }}
                        >
                          Copy URL
                        </button>
                      </div>
                    </div>

                    {/* Speed Control */}
                    <div style={{ marginBottom: 16 }}>
                      <label
                        style={{
                          fontSize: '13px',
                          display: 'block',
                          marginBottom: 8,
                          color: '#856404',
                          fontWeight: 600
                        }}
                      >
                        Playback Speed:
                      </label>
                      <select
                        value={simSpeed}
                        onChange={e => setSimSpeed(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: `1px solid ${pubPayStyle.borderColor}`,
                          borderRadius: '6px',
                          fontFamily: pubPayStyle.fontFamily,
                          fontSize: '14px',
                          background: pubPayStyle.bgPrimary,
                          cursor: 'pointer'
                        }}
                      >
                        <option value={1}>1x (Normal)</option>
                        <option value={5}>5x (Fast)</option>
                        <option value={15}>15x (Very Fast)</option>
                      </select>
                    </div>

                    {/* Status Display */}
                    <div
                      style={{
                        padding: 12,
                        background: isPlaying ? '#d1fae5' : '#fff3cd',
                        border: `1px solid ${isPlaying ? '#10b981' : '#ffc107'}`,
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: isPlaying ? '#065f46' : '#856404',
                        fontWeight: 600
                      }}
                    >
                      {isPlaying ? (
                        <div>
                          ▶ PLAYING at {simSpeed}x speed
                          {(() => {
                            const intervalMs = (1000 * 60) / simSpeed;
                            const secondsPerStep = intervalMs / 1000;
                            return ` (advancing 1 minute every ${secondsPerStep.toFixed(1)}s)`;
                          })()}
                        </div>
                      ) : (
                        <div>⏸ PAUSED</div>
                      )}
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: '12px',
                          fontWeight: 400,
                          opacity: 0.8
                        }}
                      >
                        <div>
                          <strong>UTC:</strong>{' '}
                          {new Date(simTime).toUTCString()}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <strong>Local:</strong>{' '}
                          {new Date(simTime).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Time Information */}
              {view && (
                <div
                  style={{
                    marginBottom: 32,
                    padding: 16,
                    background: pubPayStyle.bgSecondary,
                    border: `1px solid ${pubPayStyle.borderColor}`,
                    borderRadius: pubPayStyle.borderRadius
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: pubPayStyle.textPrimary,
                      fontFamily: pubPayStyle.fontFamily
                    }}
                  >
                    Time Information
                  </h3>
                  {isSimulating ? (
                    <>
                      <div
                        style={{
                          marginBottom: 8,
                          fontSize: '13px',
                          color: pubPayStyle.textSecondary
                        }}
                      >
                        <strong style={{ color: pubPayStyle.textPrimary }}>
                          🔴 Simulated time (UTC):
                        </strong>{' '}
                        {new Date(simTime).toUTCString()}
                      </div>
                      <div
                        style={{
                          marginBottom: 8,
                          fontSize: '13px',
                          color: pubPayStyle.textSecondary
                        }}
                      >
                        <strong style={{ color: pubPayStyle.textPrimary }}>
                          Simulated time (Local):
                        </strong>{' '}
                        {new Date(simTime).toLocaleString()}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          marginBottom: 8,
                          fontSize: '13px',
                          color: pubPayStyle.textSecondary
                        }}
                      >
                        <strong style={{ color: pubPayStyle.textPrimary }}>
                          Client now (UTC):
                        </strong>{' '}
                        {new Date().toUTCString()}
                      </div>
                      <div
                        style={{
                          marginBottom: 8,
                          fontSize: '13px',
                          color: pubPayStyle.textSecondary
                        }}
                      >
                        <strong style={{ color: pubPayStyle.textPrimary }}>
                          Server tick (UTC):
                        </strong>{' '}
                        {formatUTC(serverNowIso)}
                      </div>
                    </>
                  )}
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: '13px',
                      color: pubPayStyle.textSecondary
                    }}
                  >
                    <strong style={{ color: pubPayStyle.textPrimary }}>
                      Slot UTC:
                    </strong>{' '}
                    {view.active
                      ? `${new Date(view.active.slotStart).toUTCString()} → ${new Date(view.active.slotEnd).toUTCString()}`
                      : '—'}
                  </div>
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: '13px',
                      color: pubPayStyle.textSecondary
                    }}
                  >
                    <strong style={{ color: pubPayStyle.textPrimary }}>
                      Slot Local:
                    </strong>{' '}
                    {view.active
                      ? `${new Date(view.active.slotStart).toLocaleString()} → ${new Date(view.active.slotEnd).toLocaleString()}`
                      : '—'}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: pubPayStyle.textSecondary
                    }}
                  >
                    <strong style={{ color: pubPayStyle.textPrimary }}>
                      Next switch at (UTC):
                    </strong>{' '}
                    {formatUTC(view.nextSwitchAt)}
                    {nextSwitchIn ? ` (in ${nextSwitchIn})` : ''}
                  </div>
                </div>
              )}

              {/* Current Slot */}
              {view && view.active && (
                <div style={{ marginBottom: 32 }}>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: pubPayStyle.textPrimary,
                      fontFamily: pubPayStyle.fontFamily
                    }}
                  >
                    Current Slot
                  </h3>
                  <div
                    style={{
                      background: '#f0f7ff',
                      border: `1px solid #bfdbfe`,
                      borderRadius: pubPayStyle.borderRadius,
                      padding: '12px 16px'
                    }}
                  >
                    {(() => {
                      const { date, timeRange } = formatSlotTime(
                        view.active.slotStart,
                        view.active.slotEnd
                      );
                      return (
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: pubPayStyle.textPrimary,
                            marginBottom: 8,
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center'
                          }}
                        >
                          <span>{date}</span>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 400,
                              color: pubPayStyle.textSecondary
                            }}
                          >
                            •
                          </span>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 400,
                              color: pubPayStyle.textSecondary
                            }}
                          >
                            {timeRange}
                          </span>
                        </div>
                      );
                    })()}
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginBottom: 8
                      }}
                    >
                      {items.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px',
                            background: pubPayStyle.bgPrimary,
                            border: `1px solid ${itemIdx === actualIndex % items.length ? pubPayStyle.primaryColor : pubPayStyle.borderColor}`,
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color:
                              itemIdx === actualIndex % items.length
                                ? pubPayStyle.primaryColor
                                : pubPayStyle.textSecondary,
                            fontWeight:
                              itemIdx === actualIndex % items.length ? 600 : 400
                          }}
                        >
                          <span>{shortenRef(item)}</span>
                          <button
                            onClick={() => copyItemRef(item, true)}
                            style={{
                              padding: '2px 4px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: copiedItems.has(item)
                                ? '#10b981'
                                : pubPayStyle.textSecondary,
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={e => {
                              if (!copiedItems.has(item)) {
                                e.currentTarget.style.color =
                                  pubPayStyle.primaryColor;
                              }
                            }}
                            onMouseLeave={e => {
                              if (!copiedItems.has(item)) {
                                e.currentTarget.style.color =
                                  pubPayStyle.textSecondary;
                              }
                            }}
                            title="Copy full reference"
                            aria-label="Copy"
                          >
                            {copiedItems.has(item) ? '✓' : '📋'}
                          </button>
                        </div>
                      ))}
                    </div>
                    {items.length > 1 && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: pubPayStyle.textSecondary,
                          fontStyle: 'italic'
                        }}
                      >
                        Rotation: {view.policy.type} every{' '}
                        {view.policy.intervalSec}s
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Upcoming Slots */}
              {view && view.upcomingSlots && view.upcomingSlots.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: pubPayStyle.textPrimary,
                      fontFamily: pubPayStyle.fontFamily
                    }}
                  >
                    Upcoming Slots
                  </h3>
                  <div
                    style={{
                      background: pubPayStyle.bgSecondary,
                      border: `1px solid ${pubPayStyle.borderColor}`,
                      borderRadius: pubPayStyle.borderRadius,
                      maxHeight: '300px',
                      overflowY: 'auto'
                    }}
                  >
                    {view.upcomingSlots.map((s, idx) => {
                      const { date, timeRange } = formatSlotTime(
                        s.startAt,
                        s.endAt
                      );
                      return (
                        <div
                          key={`upcoming-${s.startAt}-${idx}`}
                          style={{
                            padding: '12px 16px',
                            borderBottom:
                              idx < view.upcomingSlots!.length - 1
                                ? `1px solid ${pubPayStyle.borderColor}`
                                : 'none'
                          }}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: pubPayStyle.textPrimary,
                              marginBottom: 8,
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center'
                            }}
                          >
                            <span>{date}</span>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 400,
                                color: pubPayStyle.textSecondary
                              }}
                            >
                              •
                            </span>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 400,
                                color: pubPayStyle.textSecondary
                              }}
                            >
                              {timeRange}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 6
                            }}
                          >
                            {s.items.map((item, itemIdx) => (
                              <div
                                key={itemIdx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 8px',
                                  background: pubPayStyle.bgPrimary,
                                  border: `1px solid ${pubPayStyle.borderColor}`,
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontFamily: 'monospace',
                                  color: pubPayStyle.textSecondary
                                }}
                              >
                                <span>{shortenRef(item)}</span>
                                <button
                                  onClick={() => copyItemRef(item, true)}
                                  style={{
                                    padding: '2px 4px',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    color: copiedItems.has(item)
                                      ? '#10b981'
                                      : pubPayStyle.textSecondary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'color 0.2s ease'
                                  }}
                                  onMouseEnter={e => {
                                    if (!copiedItems.has(item)) {
                                      e.currentTarget.style.color =
                                        pubPayStyle.primaryColor;
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!copiedItems.has(item)) {
                                      e.currentTarget.style.color =
                                        pubPayStyle.textSecondary;
                                    }
                                  }}
                                  title="Copy full reference"
                                  aria-label="Copy"
                                >
                                  {copiedItems.has(item) ? '✓' : '📋'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Previous Slots */}
              {view && view.previousSlots && view.previousSlots.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: pubPayStyle.textPrimary,
                      fontFamily: pubPayStyle.fontFamily
                    }}
                  >
                    Previous Slots
                  </h3>
                  <div
                    style={{
                      background: pubPayStyle.bgSecondary,
                      border: `1px solid ${pubPayStyle.borderColor}`,
                      borderRadius: pubPayStyle.borderRadius,
                      maxHeight: '300px',
                      overflowY: 'auto'
                    }}
                  >
                    {view.previousSlots.map((s, idx) => {
                      const { date, timeRange } = formatSlotTime(
                        s.startAt,
                        s.endAt
                      );
                      return (
                        <div
                          key={`prev-${s.startAt}-${idx}`}
                          style={{
                            padding: '12px 16px',
                            borderBottom:
                              idx < view.previousSlots!.length - 1
                                ? `1px solid ${pubPayStyle.borderColor}`
                                : 'none',
                            opacity: 0.8
                          }}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: pubPayStyle.textPrimary,
                              marginBottom: 8,
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center'
                            }}
                          >
                            <span>{date}</span>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 400,
                                color: pubPayStyle.textSecondary
                              }}
                            >
                              •
                            </span>
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 400,
                                color: pubPayStyle.textSecondary
                              }}
                            >
                              {timeRange}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 6
                            }}
                          >
                            {s.items.map((item, itemIdx) => (
                              <div
                                key={itemIdx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 8px',
                                  background: pubPayStyle.bgPrimary,
                                  border: `1px solid ${pubPayStyle.borderColor}`,
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontFamily: 'monospace',
                                  color: pubPayStyle.textSecondary
                                }}
                              >
                                <span>{shortenRef(item)}</span>
                                <button
                                  onClick={() => copyItemRef(item, true)}
                                  style={{
                                    padding: '2px 4px',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    color: copiedItems.has(item)
                                      ? '#10b981'
                                      : pubPayStyle.textSecondary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'color 0.2s ease'
                                  }}
                                  onMouseEnter={e => {
                                    if (!copiedItems.has(item)) {
                                      e.currentTarget.style.color =
                                        pubPayStyle.primaryColor;
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!copiedItems.has(item)) {
                                      e.currentTarget.style.color =
                                        pubPayStyle.textSecondary;
                                    }
                                  }}
                                  title="Copy full reference"
                                  aria-label="Copy"
                                >
                                  {copiedItems.has(item) ? '✓' : '📋'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
